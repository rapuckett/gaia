// Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
// SPDX-License-Identifier: MIT

// Finds English a person would read that is written outside the en/ar catalogs.
// Skipped: values passed to keepTogether() or isolate(), and any literal on a line
// marked `// english: <reason>` (trailing, or alone on the line above). An empty reason throws.

import { readdirSync, readFileSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { parseAst } from 'vite';

export const SRC = resolve(__dirname, '../..');

export interface Hit {
    line: number;
    kind: string;
    text: string;
}

/** How many strings each rule kept out of the report, by rule name. */
export type Skipped = Record<string, number>;

/** Attributes (and component props) a person reads or hears. */
const TEXT_ATTRS = new Set([
    'title', 'placeholder', 'aria-label', 'alt', 'label', 'aria-description', 'aria-roledescription',
    'aria-valuetext', 'tooltip', 'heading', 'description', 'message', 'hint', 'caption', 'subtitle',
    'summary', 'helperText', 'emptyText', 'confirmLabel', 'cancelLabel', 'actionLabel', 'text',
]);
/** Object properties that hold copy: `{ label: 'Thinking' }`. */
const TEXT_PROPS = new Set([...TEXT_ATTRS, 'detail', 'body', 'cta']);
/** Properties whose value is a name for a thing, so one capitalized word is enough. */
const LABEL_PROPS = new Set(['label', 'title', 'heading', 'placeholder', 'tooltip', 'cta', 'confirmLabel', 'cancelLabel', 'actionLabel', 'emptyText']);
/** Setters and notifiers whose argument is shown: `setError('…')`, `toast('…')`. */
const MESSAGE_CALL = /(^|\.)(set\w*(Error|Message|Notice|Status|Text|Label|Hint|Title|Toast|Banner|Warning)|toast|showToast|addToast|notify|showError|showNotice|alert|confirm)$/;
const TRANSLATE_CALL = /^(t|tp|tr|translate|t\.plural|i18n\.t|getT\(\)|getT\(\)\.plural)$/;
const LOG_CALL = /^(console|logger|log)\./;
const VALUE_CALL = /(^|\.)(keepTogether|isolate)$/;
const ENGLISH_MARKER = /\/\/\s*english:(.*)$/;
const WRAPPERS = new Set(['ParenthesizedExpression', 'TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression']);

/** Two letters in a row is English prose; all-caps names and units (GAIA, NPU, MB) are not. */
const isProse = (s: string) => /[A-Za-z]{2,}/.test(s) && /[a-z]/.test(s) && !/^(ms|s|sec|min|h|kb|mb|gb|tb|px|fps|tok(en)?s?)$/i.test(s.replace(/[\s()]|\$\{\}/g, ''));
/** Product and company names stay untranslated: a string made only of these is a name, not copy. */
const BRAND_WORDS = new Set([
    'AMD', 'AI', 'LLM', 'Gateway', 'Microsoft', 'Office', '365', 'Google', 'GitHub', 'OAuth', 'Gmail', 'Outlook',
    'Slack', 'Telegram', 'Lemonade', 'Fireworks', 'FastFlowLM', 'Vulkan', 'ROCm', 'Gemma', 'Qwen', 'Claude',
    'OpenAI', 'Ryzen', 'NPU', 'GPU', 'CPU', 'GAIA',
]);
const isBrandName = (s: string) => s.split(/[\s()]+/).filter(Boolean).every((w) => BRAND_WORDS.has(w));
/** Only HTML entities and punctuation, such as `&middot;`. */
const isEntityOnly = (s: string) => !/[A-Za-z]{2,}/.test(s.replace(/&[a-z#0-9]+;/gi, ''));
/** A catalog key such as `sidebar.label`. */
const isKeyLike = (s: string) => /^[a-z]\w*(\.[\w-]+)+$/.test(s.trim());
/** One token that is a URL, path, identifier or CSS-like name, not a word. */
const isIdentifier = (s: string) => {
    const t = s.trim();
    return !/\s/.test(t) && (/:\/\/|^[/.#@]|[/\\]|^[a-z0-9]+([_-][a-z0-9]+)+$|^[a-z]+[A-Z]\w*$|^\w+_\w+$/.test(t) || /^[a-z]\w*:\w/.test(t));
};
/** A capitalized sentence: "Could not save", not camelCase or code. */
const isSentence = (s: string) => /^[A-Z][A-Za-z']*(?: \S+)+/.test(s) && !/[{};<>=]|\/\/|^[A-Z][a-z]+[A-Z]/.test(s);
/** A count phrase around a value: `${n} left to send`. */
const isCountPhrase = (s: string) => /^[a-z]{2,}(?: [a-z]{2,})+$/.test(s) && !/[-:;/=_.]/.test(s);

type Node = { type?: string; start?: number; [key: string]: unknown };

const str = (n: Node | null | undefined): string | null => {
    if (!n) return null;
    if (n.type === 'Literal') return typeof n.value === 'string' ? n.value : null;
    if (n.type === 'TemplateLiteral') {
        return (n.quasis as Node[]).map((q) => String((q.value as { cooked?: string })?.cooked ?? '')).join('${}');
    }
    return null;
};

const calleeName = (c: Node): string => {
    switch (c.type) {
        case 'Identifier': return String(c.name);
        case 'MemberExpression': return `${calleeName(c.object as Node)}.${c.computed ? '[]' : calleeName(c.property as Node)}`;
        case 'CallExpression': return `${calleeName(c.callee as Node)}()`;
        default: return '?';
    }
};

const keyName = (p: Node): string | null => {
    if (p.computed) return null;
    const k = p.key as Node;
    return k.type === 'Identifier' ? String(k.name) : str(k);
};

/**
 * Climbs from a string through the wrappers that still render it (both arms of a ternary,
 * the value of `&&` / `||` / `??`, parentheses, casts). Returns the node that uses it.
 */
function sink(stack: Node[]): { parent: Node; child: Node; above: Node[] } {
    let i = stack.length - 1;
    let child = stack[i];
    for (i--; i >= 0; i--) {
        const p = stack[i];
        const passes =
            WRAPPERS.has(p.type!) ||
            (p.type === 'ConditionalExpression' && p.test !== child) ||
            (p.type === 'LogicalExpression' && !(p.operator === '&&' && p.left === child));
        if (!passes) break;
        child = p;
    }
    return { parent: stack[i], child, above: stack.slice(0, i) };
}

/** The first rule that says a string never reaches a person, or null. */
function silentRule(stack: Node[], text: string): string | null {
    const { parent, child } = sink(stack);
    const self = stack[stack.length - 1];
    const direct = stack[stack.length - 2];
    if (direct?.type === 'Property' && direct.key === self && !direct.computed) return 'lookup';
    if (parent?.type === 'JSXAttribute') return 'attribute';
    if (parent?.type === 'JSXExpressionContainer' && stack[stack.indexOf(parent) - 1]?.type === 'JSXAttribute') return 'attribute';
    if (isKeyLike(text)) return 'message-key';
    for (let i = stack.length - 2; i >= 0; i--) {
        const a = stack[i];
        const type = a.type!;
        if (type.startsWith('TS') && !WRAPPERS.has(type)) return 'type';
        if (type === 'ImportDeclaration' || type === 'ExportAllDeclaration' || type === 'ExportNamedDeclaration' && a.source) return 'import';
        if (type === 'TaggedTemplateExpression') return 'tagged-template';
        if (type === 'NewExpression' && /Error$/.test(calleeName(a.callee as Node))) return 'error';
        if (type === 'CallExpression') {
            const name = calleeName(a.callee as Node);
            if (TRANSLATE_CALL.test(name)) return 'translated';
            if (LOG_CALL.test(name)) return 'log';
            if (VALUE_CALL.test(name)) return 'value-wrapper';
            if (/^(describe|it|test|expect)$/.test(name)) return 'test';
            return null;
        }
        if (type === 'MemberExpression' && a.computed && a.property === stack[i + 1]) return 'lookup';
        if (type === 'BinaryExpression' && /^(===|!==|==|!=|in)$/.test(String(a.operator))) return 'lookup';
        if (type === 'SwitchCase' && a.test === stack[i + 1]) return 'lookup';
        if (type === 'JSXAttribute') return child === stack[i + 1] ? 'attribute' : null;
        if (/Function|Statement|Block|Class/.test(type)) return null;
    }
    return null;
}

/** The kind of sink a string is written into, if any: the high-confidence places for copy. */
function textSink(stack: Node[]): { kind: string; name?: string } | null {
    const { parent, child, above } = sink(stack);
    if (!parent) return null;
    if (parent.type === 'JSXExpressionContainer') {
        const owner = above[above.length - 1];
        if (owner?.type === 'JSXAttribute') {
            const name = String((owner.name as Node)?.name);
            return TEXT_ATTRS.has(name) ? { kind: 'attr', name } : null;
        }
        return owner?.type === 'JSXElement' || owner?.type === 'JSXFragment' ? { kind: 'jsx-expr' } : null;
    }
    if (parent.type === 'JSXAttribute') {
        const name = String((parent.name as Node)?.name);
        return TEXT_ATTRS.has(name) ? { kind: 'attr', name } : null;
    }
    if (parent.type === 'CallExpression' && (parent.arguments as Node[]).includes(child)) {
        return MESSAGE_CALL.test(calleeName(parent.callee as Node)) ? { kind: 'message' } : null;
    }
    if (parent.type === 'Property' && parent.value === child) {
        const name = keyName(parent);
        return name && TEXT_PROPS.has(name) ? { kind: 'prop', name } : null;
    }
    if ((parent.type === 'ReturnStatement' || parent.type === 'AssignmentExpression') && above.some((a) => a.type === 'SwitchCase')) {
        return { kind: 'case' };
    }
    return null;
}

/** Each English string a person could read, written outside the catalogs. */
export function scanSource(code: string, file = 'x.tsx', skipped: Skipped = {}): Hit[] {
    const hits: Hit[] = [];
    const lineAt = (offset: number) => code.slice(0, offset).split('\n').length;
    const skip = (rule: string) => { skipped[rule] = (skipped[rule] ?? 0) + 1; };
    const marked = new Set<number>();
    code.split('\n').forEach((text, i) => {
        const m = ENGLISH_MARKER.exec(text);
        if (!m) return;
        if (!m[1].trim()) throw new Error(`${file}:${i + 1}: "// english:" needs a reason`);
        marked.add(i + 1);
        if (text.slice(0, m.index).trim() === '') marked.add(i + 2);
    });
    const add = (kind: string, text: string, node: Node) => {
        const line = lineAt(node.start ?? 0);
        if (marked.has(line)) return skip('english-marker');
        hits.push({ line, kind, text });
    };

    const visitString = (stack: Node[], text: string) => {
        const node = stack[stack.length - 1];
        const own = text.replace(/\$\{\}/g, ' ').replace(/\s+/g, ' ').trim();
        const via = textSink(stack);
        const silent = silentRule(stack, text);
        if (silent && !(silent === 'attribute' && via?.kind === 'attr')) return skip(silent);
        if (via) {
            if (!isProse(own)) return skip('name-or-unit');
            if (isIdentifier(own)) return skip('identifier');
            if (isBrandName(own)) return skip('brand-name');
            const wordy = /\s/.test(own) || via.kind === 'jsx-expr' || via.kind === 'attr' ||
                (via.name !== undefined && LABEL_PROPS.has(via.name) && /^[A-Z][a-z]{2,}$/.test(own)) ||
                ((via.kind === 'case' || via.kind === 'message') && /^[A-Z][a-z]{2,}$/.test(own));
            if (!wordy) return skip('identifier');
            return add(via.kind, via.name ? `${via.name}="${text}"` : text, node);
        }
        if (!isProse(own) || isBrandName(own)) return skip(isProse(own) ? 'brand-name' : 'name-or-unit');
        if (isSentence(own) || (node.type === 'TemplateLiteral' && isCountPhrase(own))) add('sentence', text, node);
    };

    const visit = (node: unknown, stack: Node[]): void => {
        if (Array.isArray(node)) return node.forEach((n) => visit(n, stack));
        if (!node || typeof node !== 'object') return;
        const n = node as Node;
        if (!n.type) return;
        stack.push(n);
        if (n.type === 'JSXText') {
            const text = String(n.value).replace(/\s+/g, ' ').trim();
            if (!isProse(text) || isEntityOnly(text)) skip('name-or-unit');
            else if (isBrandName(text)) skip('brand-name');
            else add('jsx-text', text, n);
        } else if (n.type === 'ExpressionStatement' && n.directive) {
            skip('directive');
            stack.pop();
            return;
        } else {
            const text = str(n);
            if (text !== null) visitString(stack, text);
        }
        for (const [key, value] of Object.entries(n)) if (key !== 'start' && key !== 'end') visit(value, stack);
        stack.pop();
    };
    visit(parseAst(code, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' }, file), []);
    return hits;
}

/** Files the scan reads: app code, not the catalogs or tests. */
function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        const path = join(dir, d.name);
        if (d.isDirectory()) return d.name === '__tests__' || d.name === 'locales' || d.name === 'test' ? [] : sources(path);
        return /\.tsx?$/.test(d.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$|\.gen\.ts$/.test(d.name) ? [path] : [];
    });
}

export function scanAll(skipped: Skipped = {}): Record<string, Hit[]> {
    const out: Record<string, Hit[]> = {};
    for (const path of sources(SRC)) {
        const hits = scanSource(readFileSync(path, 'utf-8'), path, skipped);
        if (hits.length) out[relative(SRC, path).split(sep).join('/')] = hits;
    }
    return out;
}
