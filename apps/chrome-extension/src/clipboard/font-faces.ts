import f100normal from '@fontsource/inter/files/inter-latin-100-normal.woff2';
import f100italic from '@fontsource/inter/files/inter-latin-100-italic.woff2';
import f200normal from '@fontsource/inter/files/inter-latin-200-normal.woff2';
import f200italic from '@fontsource/inter/files/inter-latin-200-italic.woff2';
import f300normal from '@fontsource/inter/files/inter-latin-300-normal.woff2';
import f300italic from '@fontsource/inter/files/inter-latin-300-italic.woff2';
import f400normal from '@fontsource/inter/files/inter-latin-400-normal.woff2';
import f400italic from '@fontsource/inter/files/inter-latin-400-italic.woff2';
import f500normal from '@fontsource/inter/files/inter-latin-500-normal.woff2';
import f500italic from '@fontsource/inter/files/inter-latin-500-italic.woff2';
import f600normal from '@fontsource/inter/files/inter-latin-600-normal.woff2';
import f600italic from '@fontsource/inter/files/inter-latin-600-italic.woff2';
import f700normal from '@fontsource/inter/files/inter-latin-700-normal.woff2';
import f700italic from '@fontsource/inter/files/inter-latin-700-italic.woff2';
import f800normal from '@fontsource/inter/files/inter-latin-800-normal.woff2';
import f800italic from '@fontsource/inter/files/inter-latin-800-italic.woff2';
import f900normal from '@fontsource/inter/files/inter-latin-900-normal.woff2';
import f900italic from '@fontsource/inter/files/inter-latin-900-italic.woff2';

export const fontFaces: Record<string,Uint8Array> = {
  '100:false': f100normal,
  '100:true': f100italic,
  '200:false': f200normal,
  '200:true': f200italic,
  '300:false': f300normal,
  '300:true': f300italic,
  '400:false': f400normal,
  '400:true': f400italic,
  '500:false': f500normal,
  '500:true': f500italic,
  '600:false': f600normal,
  '600:true': f600italic,
  '700:false': f700normal,
  '700:true': f700italic,
  '800:false': f800normal,
  '800:true': f800italic,
  '900:false': f900normal,
  '900:true': f900italic
};
