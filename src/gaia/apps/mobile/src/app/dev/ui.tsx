import { Redirect } from 'expo-router';
import { UIProvider } from '@/ui';
import { UIGallery } from '@/ui/gallery/UIGallery';

export default function UIGalleryRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <UIProvider>
      <UIGallery />
    </UIProvider>
  );
}
