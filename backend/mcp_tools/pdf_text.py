"""
Shared PDF text extraction for the document tools.

Replaces PyMuPDF / pymupdf4llm (AGPL-3.0) with pypdfium2 — an Apache-2.0 wrapper
around PDFium, which is BSD-3-Clause. ``pypdfium2`` is imported inside the
function so the daemon's start-up path never loads a native library it may not
need (Rule 2: lazy loading).
"""

from pathlib import Path


def extract_pdf_text(path: Path | str) -> str:
    """Returns every page's text in reading order, separated by blank lines."""
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(str(path))
    try:
        pages: list[str] = []
        for index in range(len(document)):
            page = document[index]
            try:
                textpage = page.get_textpage()
                try:
                    pages.append(textpage.get_text_range())
                finally:
                    textpage.close()
            finally:
                page.close()
        return "\n\n".join(pages).strip()
    finally:
        document.close()
