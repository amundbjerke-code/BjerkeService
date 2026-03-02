declare module "svg-to-pdfkit" {
  import PDFDocument = require("pdfkit");

  type SvgToPdfOptions = {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
    assumePt?: boolean;
  };

  export default function SVGtoPDF(doc: PDFKit.PDFDocument, svg: string, x: number, y: number, options?: SvgToPdfOptions): void;
}
