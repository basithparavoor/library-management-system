# TGI LIBRARY — Android Studio Native Application

Official Android Mobile & Tablet Application for **TGI LIBRARY & Campus Management ERP**.

---

## 📱 Features Included
1. **Dynamic Branding & Admin Logo**:
   - Displays the official "TGI LIBRARY" launcher icons, colors, and splash screen.
   - Dynamically syncs custom institution logo, name, and tagline configured by the Admin.
2. **Native NFC Tag & Smartcard Reader**:
   - Automatically detects ISO-DEP, Mifare Classic, Mifare Ultralight, and NDEF patron cards on physical Android devices.
   - Feeds the scanned card UID directly to the web circulation desk and kiosk modules in real time.
3. **Hardware Barcode & Camera Scanner**:
   - Hardware-accelerated camera video capture permissions for live barcode & QR scanning.
4. **ID Card & Report PDF Print Spooler**:
   - Native Android `PrintManager` support for printing high-resolution smartcards, badges, and receipts.
5. **File Upload & Photo Chooser**:
   - Upload book covers, student ID photos, and institution crests directly from the device gallery or camera.
6. **Offline Screen & Pull-to-Refresh**:
   - Graceful offline detection with a one-tap retry button and pull-to-refresh.

---

## 🛠️ How to Open & Run in Android Studio

1. Open **Android Studio** (Hedgehog, Iguana, Jellyfish, or newer).
2. Click **Open** (or `File -> Open`).
3. Select the `android_app` folder:
   ```
   c:\Users\asus\OneDrive\Desktop\library-management-system\android_app
   ```
4. Allow Gradle to sync dependencies automatically.
5. Connect your Android phone via USB (with **USB Debugging** enabled) or start an Android Emulator.
6. Click the **Run ▶** button (or press `Shift + F10`).

---

## ⚙️ Configuration
- **Server Endpoint URL**:
  Configured in `app/src/main/res/values/strings.xml`:
  ```xml
  <string name="default_server_url">https://tgi-library.vercel.app</string>
  ```
- **App Package Name**: `com.tgi.library`
- **Minimum SDK**: Android 7.0 (API 24)
- **Target SDK**: Android 14 (API 34)
