/**
 * Renders a barcode to a canvas element for a specific book copy
 * Format: CODE128 for alphanumeric accession numbers
 */
export function generateBookLabel(accessionNo, bookTitle, canvasElementId) {
    try {
        JsBarcode(`#${canvasElementId}`, accessionNo, {
            format: "CODE128",
            lineColor: "#0f172a",
            width: 2,
            height: 50,
            displayValue: true,
            fontSize: 14,
            textMargin: 4,
            font: "monospace"
        });
        
        // Optional: Wrap canvas in a printable div with the Institute Name and Book Title
        // to create a complete physical label sticker.
    } catch (e) {
        console.error("Barcode generation failed:", e);
    }
}