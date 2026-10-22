// hallpass.js - Library Entrance Verification & Digital Hall Pass Desk
import { erp } from './erp_service.js';
import { hardware } from './hardware.js';
import { showToast, playAudioChime } from './ui.js';

let html5QrScanner = null;

document.addEventListener('DOMContentLoaded', () => {
    renderPasses();
    setupEventListeners();
    setupHardwareReaders();

    // Auto refresh transit timers every 10 seconds
    setInterval(renderPasses, 10000);
});

function renderPasses() {
    let passes = erp.getHallPasses();
    const tbody = document.getElementById('hallpass-tbody');

    const inTransit = passes.filter(p => p.status === 'IN_TRANSIT').length;
    const onTime = passes.filter(p => p.status === 'ARRIVED_ON_TIME').length;
    const late = passes.filter(p => p.status === 'LATE_ARRIVAL' || p.flagged_truant).length;

    document.getElementById('kpi-in-transit').innerText = inTransit;
    document.getElementById('kpi-ontime').innerText = onTime;
    document.getElementById('kpi-late').innerText = late;

    if (passes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">No active student hall passes recorded today.</td></tr>`;
        return;
    }

    tbody.innerHTML = passes.map(p => {
        const now = new Date();
        const expected = new Date(p.expected_arrival_at);
        const diffMins = Math.round((expected - now) / (1000 * 60));
        
        let statusBadge = `<span class="badge badge-brand"><span class="badge-dot"></span> IN TRANSIT (${Math.max(0, diffMins)}m left)</span>`;
        if (p.status === 'ARRIVED_ON_TIME') statusBadge = `<span class="badge badge-success"><span class="badge-dot"></span> ARRIVED ON-TIME</span>`;
        if (p.status === 'LATE_ARRIVAL' || p.flagged_truant) statusBadge = `<span class="badge badge-danger">⚠ LATE ARRIVAL</span>`;

        const isTransit = p.status === 'IN_TRANSIT';

        return `
            <tr>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--brand-primary);">${p.id}</td>
                <td>
                    <div style="font-weight: 700; color: var(--text-primary);">${p.student_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${p.student_id}</div>
                </td>
                <td style="font-size: 0.85rem;">${p.origin_class}</td>
                <td style="font-size: 0.85rem;"><strong>${p.teacher_name}</strong></td>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(p.issued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    ${isTransit ? `
                        <button class="btn btn-primary btn-sm btn-verify-single" data-id="${p.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
                            <i data-lucide="check" style="width: 14px;"></i> Verify Arrival
                        </button>
                    ` : `<span style="font-size: 0.75rem; color: var(--text-muted);">${p.verified_arrival_at ? new Date(p.verified_arrival_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</span>`}
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-verify-single').forEach(btn => {
        btn.addEventListener('click', () => {
            handleVerifyEntrance(btn.dataset.id);
        });
    });

    if (window.lucide) lucide.createIcons();

    // Refresh mobile card view
    if (window.initMobileCardTables) window.initMobileCardTables();
}

function handleVerifyEntrance(inputCode) {
    const val = (inputCode || '').trim();
    if (!val) {
        showToast('Please scan student card or hall pass code', 'warning');
        return;
    }

    const fb = document.getElementById('entrance-verification-result');
    fb.style.display = 'block';

    try {
        const pass = erp.verifyHallPassArrival(val);
        const isLate = pass.status === 'LATE_ARRIVAL';

        if (isLate) {
            playAudioChime('ERROR');
            fb.style.background = 'rgba(239, 68, 68, 0.1)';
            fb.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            fb.innerHTML = `
                <div style="font-size: 1rem; font-weight: 800; color: var(--color-danger); margin-bottom: 0.25rem;">⚠ Late Arrival Flagged</div>
                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${pass.student_name} (${pass.student_id})</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">From: ${pass.origin_class} • Issued By: ${pass.teacher_name}</div>
                <div style="font-size: 0.78rem; color: var(--color-danger); font-weight: 600; margin-top: 0.35rem;">Exceeded 15-minute transit window. Incident logged for academic records.</div>
            `;
            showToast(`Late Arrival: ${pass.student_name}`, 'warning');
        } else {
            playAudioChime('SUCCESS');
            fb.style.background = 'rgba(16, 185, 129, 0.1)';
            fb.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            fb.innerHTML = `
                <div style="font-size: 1rem; font-weight: 800; color: var(--color-success); margin-bottom: 0.25rem;">✓ Entrance Verified On-Time</div>
                <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${pass.student_name} (${pass.student_id})</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">From: ${pass.origin_class} • Approved for Library Entry</div>
                <div style="font-size: 0.78rem; color: var(--color-success); font-weight: 600; margin-top: 0.35rem;">Pass cleared within permitted departure timeframe.</div>
            `;
            showToast(`Verified On-Time: ${pass.student_name}`, 'success');
        }

        document.getElementById('entrance-scan-input').value = '';
        renderPasses();
    } catch (err) {
        playAudioChime('ERROR');
        fb.style.background = 'rgba(239, 68, 68, 0.1)';
        fb.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        fb.innerHTML = `
            <div style="font-size: 1rem; font-weight: 800; color: var(--color-danger); margin-bottom: 0.25rem;">✖ Unauthorized Entrance</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary);">${err.message}</div>
        `;
        showToast(err.message, 'error');
    }
}

function setupEventListeners() {
    const input = document.getElementById('entrance-scan-input');
    const btnVerify = document.getElementById('btn-verify-entrance');

    btnVerify?.addEventListener('click', () => handleVerifyEntrance(input.value));
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleVerifyEntrance(input.value);
    });

    // Modal: Issue Digital Pass
    const modal = document.getElementById('modal-issue-pass');
    document.getElementById('btn-issue-pass')?.addEventListener('click', () => modal.style.display = 'flex');
    document.getElementById('btn-close-pass-modal')?.addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-cancel-pass')?.addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('form-issue-pass')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const pass = erp.issueHallPass(
            document.getElementById('pass-student-id').value.trim(),
            document.getElementById('pass-student-name').value.trim(),
            document.getElementById('pass-teacher').value.trim(),
            document.getElementById('pass-origin').value.trim(),
            document.getElementById('pass-reason').value,
            15
        );

        playAudioChime('SUCCESS');
        showToast(`Digital Hall Pass #${pass.id} issued for 15 minutes!`, 'success');
        modal.style.display = 'none';
        document.getElementById('form-issue-pass').reset();
        renderPasses();
    });

    // Camera QR Toggle
    document.getElementById('btn-entrance-camera')?.addEventListener('click', () => {
        const container = document.getElementById('entrance-camera-reader');
        if (container.style.display === 'none' || !container.style.display) {
            container.style.display = 'block';
            if (window.Html5Qrcode) {
                html5QrScanner = new Html5Qrcode("entrance-camera-reader");
                html5QrScanner.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText) => {
                        handleVerifyEntrance(decodedText);
                    },
                    () => {}
                ).catch(console.error);
            }
        } else {
            container.style.display = 'none';
            if (html5QrScanner) html5QrScanner.stop().then(() => html5QrScanner.clear()).catch(console.error);
        }
    });

    // Hardware NFC reader button
    document.getElementById('btn-entrance-nfc')?.addEventListener('click', async () => {
        showToast('Hold student NFC smartcard near the reader...', 'info');
        await hardware.startNfcScan((tagId) => {
            handleVerifyEntrance(tagId);
        });
    });
}

function setupHardwareReaders() {
    hardware.onBarcodeScan((code) => {
        handleVerifyEntrance(code);
    });
}

