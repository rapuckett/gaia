import { isolate } from '@webui/i18n/registry';
import { Text } from './Text';

export function Ltr({ children }: { children: string }) {
  return <Text>{isolate(children, 'ltr')}</Text>;
}
