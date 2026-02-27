/**
 * FileTypeIcon — Maps file extensions to SVG file type icons
 * Uses SVG files from src/icons/filetypes/
 */

// Import all filetype SVGs
import aviIcon from './filetypes/avi.svg';
import cssIcon from './filetypes/css.svg';
import docIcon from './filetypes/doc.svg';
import dwgIcon from './filetypes/dwg.svg';
import exeIcon from './filetypes/exe.svg';
import fileIcon from './filetypes/file.svg';
import htmlIcon from './filetypes/html.svg';
import isoIcon from './filetypes/iso.svg';
import jsIcon from './filetypes/javascript.svg';
import mp3Icon from './filetypes/mp3.svg';
import mp4Icon from './filetypes/mp4.svg';
import pdfIcon from './filetypes/pdf.svg';
import pngIcon from './filetypes/png.svg';
import txtIcon from './filetypes/txt.svg';
import xlsIcon from './filetypes/xls.svg';
import xmlIcon from './filetypes/xml.svg';
import zipIcon from './filetypes/zip.svg';

// Extension → icon mapping
const EXT_MAP = {
  // Documents
  doc: docIcon, docx: docIcon, odt: docIcon,
  pdf: pdfIcon,
  txt: txtIcon, log: txtIcon, md: txtIcon, rtf: txtIcon,
  xls: xlsIcon, xlsx: xlsIcon, csv: xlsIcon, ods: xlsIcon,

  // Code
  html: htmlIcon, htm: htmlIcon,
  css: cssIcon, scss: cssIcon, sass: cssIcon, less: cssIcon,
  js: jsIcon, jsx: jsIcon, ts: jsIcon, tsx: jsIcon, mjs: jsIcon,
  xml: xmlIcon, json: xmlIcon, yaml: xmlIcon, yml: xmlIcon, toml: xmlIcon,

  // Images
  png: pngIcon, jpg: pngIcon, jpeg: pngIcon, gif: pngIcon,
  bmp: pngIcon, svg: pngIcon, webp: pngIcon, ico: pngIcon, tiff: pngIcon,

  // Audio
  mp3: mp3Icon, wav: mp3Icon, flac: mp3Icon, aac: mp3Icon,
  ogg: mp3Icon, wma: mp3Icon, m4a: mp3Icon,

  // Video
  mp4: mp4Icon, avi: aviIcon, mkv: aviIcon, mov: mp4Icon,
  wmv: aviIcon, flv: aviIcon, webm: mp4Icon, m4v: mp4Icon,

  // Archives
  zip: zipIcon, rar: zipIcon, '7z': zipIcon, tar: zipIcon,
  gz: zipIcon, bz2: zipIcon, xz: zipIcon, zst: zipIcon,

  // Disk images
  iso: isoIcon, img: isoIcon, dmg: isoIcon, vhd: isoIcon, vmdk: isoIcon,

  // Executables
  exe: exeIcon, msi: exeIcon, deb: exeIcon, rpm: exeIcon,
  appimage: exeIcon, sh: exeIcon, bat: exeIcon, cmd: exeIcon,

  // CAD
  dwg: dwgIcon, dxf: dwgIcon,
};

/**
 * Get the icon URL for a filename
 * @param {string} filename
 * @returns {string} icon URL
 */
export function getFileTypeIcon(filename) {
  if (!filename) return fileIcon;
  const ext = filename.split('.').pop()?.toLowerCase();
  return EXT_MAP[ext] || fileIcon;
}

/**
 * FileTypeIcon component
 * @param {string} filename - file name to determine icon
 * @param {number} size - icon size in px
 */
export default function FileTypeIcon({ filename, size = 32, style, className }) {
  const icon = getFileTypeIcon(filename);
  return (
    <img
      src={icon}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', ...style }}
      className={className}
      draggable={false}
    />
  );
}
