"""List every GET route in the installed GAIA UI backend with its full path, and flag
bodies (plus same-module helpers, followed transitively) that call side-effecting names."""
import ast
import re
import sys
from pathlib import Path

SUSPECT = re.compile(
    r"(start|launch|spawn|popen|subprocess|run(?!ning)|load(?!s?_?json|_config|_settings)|pull|download|install|"
    r"delete|remove|unlink|rmtree|write|save|update|upsert|insert|set_|scan|index|infer|completion|generate|"
    r"ensure|warm|kill|stop|restart|create|commit|execute|connect|refresh|sync|send|notify|mark|record|track|"
    r"open_|mkdir|touch|evict|unload|reload|browser|history|post|put|patch)",
    re.I,
)
BENIGN = {"startswith", "endswith", "ensure_within_home", "loads", "model_dump", "get_history"}


def direct_calls(node):
    names = set()
    for n in ast.walk(node):
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Attribute):
                names.add(f.attr)
            elif isinstance(f, ast.Name):
                names.add(f.id)
            if isinstance(f, ast.Name) and f.id == "Depends":
                for a in n.args:
                    if isinstance(a, ast.Name):
                        names.add(a.id)
    return names


def router_prefixes(tree):
    out = {}
    for n in ast.walk(tree):
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call):
            if ast.unparse(n.value.func).endswith("APIRouter"):
                prefix = ""
                for kw in n.value.keywords:
                    if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                        prefix = kw.value.value
                for t in n.targets:
                    if isinstance(t, ast.Name):
                        out[t.id] = prefix
    return out


def expand(name, module_funcs, seen):
    if name in seen or name not in module_funcs:
        return set()
    seen.add(name)
    calls = direct_calls(module_funcs[name])
    out = set(calls)
    for c in calls:
        out |= expand(c, module_funcs, seen)
    return out


def scan(path):
    tree = ast.parse(path.read_text(), filename=str(path))
    prefixes = router_prefixes(tree)
    prefixes.setdefault("app", "")
    module_funcs = {
        n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for dec in fn.decorator_list:
            if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)):
                continue
            if dec.func.attr != "get" or not isinstance(dec.func.value, ast.Name):
                continue
            var = dec.func.value.id
            if var not in prefixes:
                continue
            sub = dec.args[0].value if dec.args and isinstance(dec.args[0], ast.Constant) else "?"
            full = prefixes[var] + sub
            calls = direct_calls(fn)
            allc = set(calls)
            for c in calls:
                allc |= expand(c, module_funcs, {fn.name})
            flagged = sorted(n for n in allc if SUSPECT.search(n) and n not in BENIGN)
            yield full or "/", path.name, fn.lineno, fn.name, flagged


def main(root):
    root = Path(root)
    files = sorted((root / "routers").glob("*.py")) + [root / "server.py", root / "email_sidecar" / "router.py"]
    for path in files:
        for full, fname, line, func, flagged in scan(path):
            mark = "FLAG" if flagged else "ok  "
            print(f"{mark}\t{full}\t{fname}:{line}\t{func}\t{' '.join(flagged)}")


if __name__ == "__main__":
    main(sys.argv[1])
