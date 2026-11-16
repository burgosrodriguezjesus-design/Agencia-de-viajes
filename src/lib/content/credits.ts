// Autoría y licencia de las fotografías incluidas en /public/images.
export interface PhotoCredit {
  file: string;
  title: string;
  author: string;
  license: string;
  source: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [];
