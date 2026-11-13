# `@/ui`: the app's UI library, MVP contract (Design, 2026-11-12)

_Never committed. Owner: Design. `src/gaia/apps/mobile/src/ui/**` is Design's alone. Features and routes import UI from `@/ui` (and icons from `@/ui/icons`), never `View`, `Text`, `StyleSheet`, `Pressable`, `TextInput`, `ScrollView`, `FlatList` or `Modal` from react-native. Logic from react-native (`Platform`, `Linking`, `AppState`, `useWindowDimensions`, `AccessibilityInfo`) is fine._

Builders on other lanes code against these names now. Design's builders may refine a prop and will list any change in their report; the names stay. Need something that isn't here? Ask Design (one message, with your branch name) rather than drawing your own. **One exception:** to use another Lucide icon, add one re-export line to `src/ui/icons.ts` in your branch and say so in your report.

## Two branches, in order

1. **`design/mobile-ui-core`:** tokens, theme, fonts, `Text`, layout, `Pressable`, `Button`, `IconButton`, `Icon`, `Screen`, `TextField`, `Spinner`. Lands first.
2. **`design/mobile-ui-lists`:** `ListRow`, `SectionHeader`, `StatusDot`, `Badge`, the list states, `List`, `SectionList`, `Sheet`, `ActionSheet`, `Notice`, `ProgressLine`, `ChoiceList`, `Chip`, `Disclosure`. Lands second.

## Native libraries the first dev build must include

Same versions as `expo/bundledNativeModules.json` for SDK 58: `react-native-svg` 15.16.0 (icons), `react-native-keyboard-controller` 1.22.7 (`Screen`'s keyboard), `react-native-reanimated` 4.7.1 with `react-native-worklets` 0.13.0 (keyboard-controller needs them; sheets animate on them), `react-native-gesture-handler` ~3.3.0 (sheet drag; a drawer needs it too), `expo-clipboard` ~58.0.4 (copy). JS only: `lucide-react-native` 1.72.0, `@expo-google-fonts/inter`, `/jetbrains-mono`, `/fraunces`. Fonts load through `expo-font`, which `expo` already links.

## Mounting (Mobile's `_layout.tsx`)

- `<UIProvider>`: theme (follows the system's light or dark; the palette is `default` until Settings has one), fonts (holds the splash screen until they load), safe areas, the keyboard provider, gesture root and the sheet host. Mount it once, outside the navigator.
- `useTheme()`: `{ scheme, colors, radius, space, type, faces, shadows, motion }`. Features rarely need it; components take roles, not values.

## Roles

- **Colors:** the web UI's roles in camelCase, generated from `index.css` and `palettes.css`, for example `bgPrimary`, `bgSecondary`, `bgCard`, `bgUserMsg`, `bgInput`, `bgHover`, `bgModalOverlay`, `textPrimary`, `textSecondary`, `textMuted`, `textInverse`, `border`, `borderLight`, `accent`, `accentFill`, `accentFillText`, `danger`, `dangerDim`, `accentGreen`, `accentYellow`, `accentBlue`, `bgCode`, `textCode`. Never a hex in a feature.
- **Text tone** (`tone`): `primary` (default), `secondary`, `muted`, `inverse`, `accent`, `danger`, `success`, `warning`, `onAccent` (text on a filled brass button).
- **Type** (`role`): `caption` 13, `label` 14, `ui` 15, `body` 16, `prose` 17, `title` 20 (upstream's sizes + 2 on phones), and `display` 28 in the greeting face (Fraunces 300). Sizes follow the system text size.
- **Space** (`gap`, `padding`): `none`, `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `xxl` 32.
- **Radius:** `xs` to `xl`, `full`, from the CSS.

## Branch 1: `design/mobile-ui-core`

| Export | Props (the important ones) | Notes |
| --- | --- | --- |
| `Text` | `role`, `tone`, `weight` (`regular`, `medium`, `semibold`, `bold`), `mono`, `italic`, `align` (`start`, `center`, `end`), `numberOfLines`, `selectable`, `accessibilityRole` | Nest a `Text` for an inline span. Arabic gets its taller line height. |
| `Ltr` | children (a string) | A file name, model name or number with a unit inside Arabic text, kept left to right. |
| `Stack` | `gap`, `padding`, `paddingX`, `paddingY`, `align`, `justify`, `flex` | A column. `paddingX` is start and end. |
| `Row` | `gap`, `align` (default `center`), `justify`, `wrap`, `flex` | A row that mirrors in Arabic. |
| `Spacer` |  | Takes the free space in a `Row` or `Stack`. |
| `Surface` | `tone` (`primary`, `secondary`, `card`, `recessed`, `userMsg`), `radius`, `padding`, `border`, `elevation` (`none`, `sm`, `md`, `lg`) | Any panel. |
| `Card` | `padding`, `onPress` | A `Surface` with the card's border, radius and shadow; pressable when given `onPress`. |
| `Divider` | `inset` |  |
| `Pressable` | `onPress`, `onLongPress`, `disabled`, `accessibilityLabel`, `accessibilityRole`, `accessibilityState` | Every touch target is at least 48 by 48 (hit area, not a bigger icon). Press feedback from the theme. |
| `Button` | `label`, `onPress`, `variant` (`primary`, `secondary`, `ghost`, `danger`), `size` (`md`, `sm`), `icon`, `iconEnd`, `busy`, `disabled`, `full` | `primary` is the brass fill, used only for the one main action. `busy` shows a spinner and blocks presses. |
| `IconButton` | `icon`, `label` (required: the accessible name), `onPress`, `variant` (`ghost`, `filled`, `primary`, `danger`), `size` (`md`, `sm`), `busy`, `disabled` | 48 by 48. Send and Stop are `IconButton`s. |
| `Icon` | `icon`, `size` (`sm` 16, `md` 20, `lg` 24), `tone` | Decorative unless given `label`. |
| `@/ui/icons` | Lucide components, re-exported by name, e.g. `X`, `Plus`, `Menu`, `Lock`, `Send` or `ArrowUp`, `Square`, `Copy`, `RotateCcw`, `ChevronDown`, `ChevronRight`, `Ellipsis`, `Check`, `CircleAlert`, `TriangleAlert`, `Info`, `Search`, `ArrowDown`, `Wrench`, `Brain`, `FileText`, `Paperclip` | The same icon set as the web UI (`lucide-react`). Chevrons that point along the reading direction mirror in Arabic. |
| `Screen` | `children`, `edges` (default all four), `keyboard` (`avoid`, `none`), `scroll`, `header`, `footer`, `background` | Safe areas on every side. `keyboard="avoid"` keeps the focused field, its submit and the newest message above the keyboard; `footer` (the composer dock) rides on top of the keyboard. Features never measure the keyboard. |
| `TextField` | `value`, `onChangeText`, `label`, `placeholder`, `hint`, `error`, `multiline`, `maxLines` (grows up to it), `returnKeyType`, `onSubmitEditing`, `secureTextEntry`, `autoFocus`, `disabled`, `inputRef`, `accessibilityLabel` | Text at least 16. Return is a new line when `multiline`. |
| `Spinner` | `size`, `tone` | Busy marker. |

## Branch 2: `design/mobile-ui-lists`

| Export | Props | Notes |
| --- | --- | --- |
| `ListRow` | `title`, `subtitle`, `leading`, `trailing`, `onPress`, `onLongPress`, `selected`, `titleLines` (default 1), `accessibilityLabel` | At least 48 tall. Long titles truncate at the end; a row never scrolls sideways. |
| `SectionHeader` | `title`, `trailing` | Group headings ("Today", "Pinned"). |
| `StatusDot` | `tone` (`idle`, `running`, `attention`, `error`, `success`), `label` | Never color alone: `label` is its accessible text. |
| `Badge` | `label`, `tone` | Small count or tag. |
| `Skeleton`, `ListSkeleton` | `width`, `height`; `rows` | Loading placeholders; still under reduced motion. |
| `EmptyState`, `ErrorState`, `LoadingState` | `title`, `message`, `action` (`{ label, onPress }`); `ErrorState` takes `onRetry` | The shared empty, failed and loading states. |
| `List` | FlatList's props (typed), `inverted` | Defaults: drag dismisses the keyboard, taps go through while it's up. The message list uses it. |
| `SectionList` | SectionList's props (typed) | The chat drawer's groups. |
| `Sheet` | `open`, `onClose`, `title`, `children`, `footer`, `dismissible` (default true) | A bottom sheet on a phone, a centered dialog from 600 wide. Closes on the handle drag, a scrim tap, Android back and the VoiceOver escape gesture. One open at a time: a second waits until the first has gone. Permission prompts and question cards sit in one. |
| `ActionSheet` | `open`, `onClose`, `actions` (`{ label, icon, destructive, onPress }[]`) | A message's actions (copy, retry, edit). |
| `Notice` | `tone` (`info`, `warning`, `danger`, `success`), `title`, `message`, `action` (`{ label, onPress }`) | Inline: "The assistant didn't start", send errors. |
| `ProgressLine` | `value` (0 to 1, or absent for indeterminate), `label` | The slim warm-up line. |
| `ChoiceList` | `options` (`{ value, label, description }[]`), `value`, `onChange`, `multiple` | Radio or checkbox rows for answer options. |
| `Chip` | `label`, `selected`, `onPress`, `icon` | Choice chips and filters. |
| `Disclosure` | `title`, `open`, `onToggle`, `children`, `trailing` | Collapsed tool steps and thinking. |

## The chat drawer

The drawer itself is Mobile's navigation (`fnd-nav`). Its content uses `Screen edges={['top', 'bottom', 'start']}` with a `SectionList` of `ListRow`s.
