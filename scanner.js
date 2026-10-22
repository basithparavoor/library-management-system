// Attach this to a "Scan with Camera" button in the UI
let html5QrcodeScanner = null;

export function initCameraScanner(targetInputId) {
    const readerElement = document.getElementById('reader');
    if (!readerElement) {
        console.error("Scanner element <div id='reader'></div> not found in DOM.");
        return;
    }

    // Show the scanner container
    readerElement.style.display = 'block';

    if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
            fps: 10, 
            qrbox: { width: 250, height: 100 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true
        }, false);
    }

    html5QrcodeScanner.render(
        (decodedText) => {
            // Success Callback
            console.log(`Scan result: ${decodedText}`);
            
            // Fill the target input and play a success sound
            const inputField = document.getElementById(targetInputId);
            if (inputField) {
                inputField.value = decodedText;
                
                // Trigger an Enter keypress to auto-submit the form
                inputField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
                
                // Stop scanner
                closeScanner();
            }
        },
        (errorMessage) => {
            // Background scan errors (ignored to prevent console spam)
        }
    );
}

export function closeScanner() {
    const readerElement = document.getElementById('reader');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            if(readerElement) readerElement.style.display = 'none';
        }).catch(err => console.error("Failed to clear scanner:", err));
    }
}

// Make globally available for inline HTML onclick attributes if needed
window.startScanner = initCameraScanner;
window.stopScanner = closeScanner;