/**
 * QR Code Studio Pro 2.0
 * 4U.IA.BR Labs - https://github.com/4u-Labs
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL ---
    let qrcodeInstance = null;
    let liveDebounceTimer = null;
    let currentRawData = '';
    let currentFinalCanvas = null;
    let selectedLogo = 'none';
    let customLogoImg = null;
    let selectedFrame = 'none';
    let html5QrCode = null;
    let historyData = [];

    const STORAGE_KEY_HISTORY = '4u_qr_studio_history_v1';

    // --- ELEMENTOS DO DOM ---
    const contentTypeSelect = document.getElementById('content-type');
    const qrCodeCanvasDiv = document.getElementById('qrCodeCanvasDiv');
    const qrColorInput = document.getElementById('qr-color');
    const qrBgColorInput = document.getElementById('qr-bg-color');
    const qrSizeSelect = document.getElementById('qr-size');
    const colorPreviewPrimary = document.getElementById('color-preview-primary');
    const colorPreviewBg = document.getElementById('color-preview-bg');
    const previewStatusBadge = document.getElementById('previewStatusBadge');
    const pixSummaryCard = document.getElementById('pixSummaryCard');
    const pixPayloadText = document.getElementById('pixPayloadText');
    const pixValueBadge = document.getElementById('pixValueBadge');
    const customLogoPreviewBadge = document.getElementById('customLogoPreviewBadge');
    const logoUploadInput = document.getElementById('logoUploadInput');
    const customFrameTextInputWrapper = document.getElementById('customFrameTextInputWrapper');
    const customFrameText = document.getElementById('customFrameText');
    const preloader = document.getElementById('preloader');

    // --- INICIALIZAÇÃO ---
    initApp();

    function initApp() {
        // Hide preloader
        setTimeout(() => {
            if (preloader) preloader.classList.add('hidden');
        }, 300);

        loadHistory();
        bindEvents();
        updateColorPreviews();
        renderLiveQRCode();

        // Register Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(r => console.log('QR Studio SW Registered:', r.scope))
                .catch(err => console.warn('QR Studio SW Error:', err));
        }
    }

    // --- BIND DE EVENTOS ---
    function bindEvents() {
        // Troca de tipo de conteúdo
        contentTypeSelect.addEventListener('change', () => {
            const val = contentTypeSelect.value;
            document.querySelectorAll('.content-options').forEach(el => el.classList.remove('active'));
            const target = document.getElementById(`${val}-options`);
            if (target) target.classList.add('active');

            const badge = document.getElementById('badgeTypeActive');
            if (badge) badge.textContent = contentTypeSelect.options[contentTypeSelect.selectedIndex].text.split(' ')[1] || 'Ativo';

            // Ajustar logo recomendado automaticamente se usuário não escolheu outro
            if (selectedLogo === 'none' || selectedLogo === 'pix' || selectedLogo === 'whatsapp' || selectedLogo === 'wifi') {
                if (val === 'pix') selectLogo('pix');
                else if (val === 'whatsapp') selectLogo('whatsapp');
                else if (val === 'wifi') selectLogo('wifi');
                else selectLogo('none');
            }

            scheduleLiveUpdate();
        });

        // Live update em todos os inputs do formulário
        document.getElementById('qr-form').addEventListener('input', scheduleLiveUpdate);
        document.getElementById('qr-form').addEventListener('change', scheduleLiveUpdate);

        // Cores
        qrColorInput.addEventListener('input', () => {
            updateColorPreviews();
            scheduleLiveUpdate();
        });
        qrBgColorInput.addEventListener('input', () => {
            updateColorPreviews();
            scheduleLiveUpdate();
        });
        qrSizeSelect.addEventListener('change', scheduleLiveUpdate);

        // Seletor de Logo
        document.querySelectorAll('.logo-badge-btn[data-logo]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectLogo(btn.dataset.logo);
                scheduleLiveUpdate();
            });
        });

        // Upload de Logo personalizado
        logoUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        customLogoImg = img;
                        selectedLogo = 'custom';
                        document.querySelectorAll('.logo-badge-btn').forEach(b => b.classList.remove('active'));
                        if (customLogoPreviewBadge) customLogoPreviewBadge.style.display = 'block';
                        scheduleLiveUpdate();
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });

        // Seletor de Moldura (Frame)
        document.querySelectorAll('.frame-badge-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.frame-badge-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedFrame = btn.dataset.frame;

                if (selectedFrame === 'custom') {
                    customFrameTextInputWrapper.style.display = 'block';
                    customFrameText.focus();
                } else {
                    customFrameTextInputWrapper.style.display = 'none';
                }
                scheduleLiveUpdate();
            });
        });

        if (customFrameText) {
            customFrameText.addEventListener('input', scheduleLiveUpdate);
        }
    }

    function selectLogo(logoType) {
        selectedLogo = logoType;
        document.querySelectorAll('.logo-badge-btn[data-logo]').forEach(b => {
            b.classList.toggle('active', b.dataset.logo === logoType);
        });
        if (logoType !== 'custom' && customLogoPreviewBadge) {
            customLogoPreviewBadge.style.display = 'none';
            customLogoImg = null;
        }
    }

    window.clearCustomLogo = function() {
        customLogoImg = null;
        if (customLogoPreviewBadge) customLogoPreviewBadge.style.display = 'none';
        selectLogo('none');
        scheduleLiveUpdate();
    };

    function updateColorPreviews() {
        if (colorPreviewPrimary) colorPreviewPrimary.textContent = qrColorInput.value.toUpperCase();
        if (colorPreviewBg) colorPreviewBg.textContent = qrBgColorInput.value.toUpperCase();
    }

    function scheduleLiveUpdate() {
        if (previewStatusBadge) {
            previewStatusBadge.textContent = 'Gerando...';
            previewStatusBadge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle';
        }
        clearTimeout(liveDebounceTimer);
        liveDebounceTimer = setTimeout(renderLiveQRCode, 250);
    }

    // --- ENGINES DE DADOS ---

    /**
     * Motor de Geração Oficial de Payload PIX (Banco Central do Brasil / EMVco)
     */
    function formatEMV(id, val) {
        const len = val.length.toString().padStart(2, '0');
        return `${id}${len}${val}`;
    }

    function calculateCRC16(payload) {
        const polynomial = 0x1021;
        let crc = 0xFFFF;
        for (let i = 0; i < payload.length; i++) {
            crc ^= (payload.charCodeAt(i) << 8);
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = ((crc << 1) ^ polynomial) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
    }

    function getPixPayload() {
        const key = (document.getElementById('pix-key')?.value || '').trim();
        if (!key) return null;

        const name = (document.getElementById('pix-name')?.value || 'RECEBEDOR')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().substring(0, 25);
        const city = (document.getElementById('pix-city')?.value || 'SAO PAULO')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().substring(0, 15);
        const amount = document.getElementById('pix-amount')?.value;
        const txid = (document.getElementById('pix-txid')?.value || '***')
            .replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || '***';

        let payload = formatEMV('00', '01');
        let mai = formatEMV('00', 'br.gov.bcb.pix') + formatEMV('01', key);
        payload += formatEMV('26', mai);
        payload += formatEMV('52', '0000');
        payload += formatEMV('53', '986');

        if (amount && parseFloat(amount) > 0) {
            payload += formatEMV('54', parseFloat(amount).toFixed(2));
        }

        payload += formatEMV('58', 'BR');
        payload += formatEMV('59', name);
        payload += formatEMV('60', city);
        payload += formatEMV('62', formatEMV('05', txid));
        payload += '6304';

        const fullPayload = payload + calculateCRC16(payload);

        // Atualizar Card de Copia e Cola
        if (pixSummaryCard && pixPayloadText) {
            pixSummaryCard.style.display = 'block';
            pixPayloadText.value = fullPayload;
            if (pixValueBadge) {
                pixValueBadge.textContent = (amount && parseFloat(amount) > 0)
                    ? `R$ ${parseFloat(amount).toFixed(2).replace('.', ',')}`
                    : 'Valor Livre';
            }
        }

        return fullPayload;
    }

    window.updatePixPlaceholder = function() {
        const type = document.getElementById('pix-key-type')?.value;
        const input = document.getElementById('pix-key');
        if (!input) return;
        if (type === 'cpf') input.placeholder = '000.000.000-00 ou 11 dígitos';
        else if (type === 'cnpj') input.placeholder = '00.000.000/0000-00 ou 14 dígitos';
        else if (type === 'phone') input.placeholder = '+5511987654321';
        else if (type === 'email') input.placeholder = 'seu-email@dominio.com';
        else if (type === 'random') input.placeholder = 'Chave aleatória (EVP)';
    };

    /**
     * Coleta os dados de acordo com o tipo selecionado
     */
    function collectCurrentData() {
        const type = contentTypeSelect.value;
        if (pixSummaryCard && type !== 'pix') pixSummaryCard.style.display = 'none';

        switch (type) {
            case 'pix':
                return getPixPayload();

            case 'url':
                let url = (document.getElementById('url-link')?.value || '').trim();
                if (!url) url = 'https://4u.ia.br';
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                return url;

            case 'whatsapp':
                const country = document.getElementById('whatsapp-country')?.value || '55';
                const number = (document.getElementById('whatsapp-number')?.value || '').replace(/\D/g, '');
                const msg = document.getElementById('whatsapp-message')?.value || '';
                if (!number) return null;
                let wa = `https://wa.me/${country}${number}`;
                if (msg) wa += `?text=${encodeURIComponent(msg)}`;
                return wa;

            case 'wifi':
                const ssid = (document.getElementById('wifi-ssid')?.value || '').trim();
                const enc = document.getElementById('wifi-encryption')?.value || 'WPA';
                const pass = document.getElementById('wifi-password')?.value || '';
                if (!ssid) return null;
                return `WIFI:S:${ssid};T:${enc};P:${pass};;`;

            case 'vcard':
                const vName = document.getElementById('vcard-name')?.value || '';
                const vTel = document.getElementById('vcard-tel')?.value || '';
                const vEmail = document.getElementById('vcard-email')?.value || '';
                const vComp = document.getElementById('vcard-company')?.value || '';
                if (!vName && !vTel) return null;
                return `BEGIN:VCARD\nVERSION:3.0\nN:${vName}\nFN:${vName}\nORG:${vComp}\nTEL:${vTel}\nEMAIL:${vEmail}\nEND:VCARD`;

            case 'googlemaps':
                const mapLink = (document.getElementById('googlemaps-link')?.value || '').trim();
                return mapLink || 'https://maps.google.com';

            case 'email':
                const email = document.getElementById('email-address')?.value || '';
                const sub = document.getElementById('email-subject')?.value || '';
                const body = document.getElementById('email-body')?.value || '';
                if (!email) return null;
                let mailto = `mailto:${email}`;
                const params = [];
                if (sub) params.push(`subject=${encodeURIComponent(sub)}`);
                if (body) params.push(`body=${encodeURIComponent(body)}`);
                if (params.length) mailto += `?${params.join('&')}`;
                return mailto;

            case 'sms':
                const smsNum = document.getElementById('sms-number')?.value || '';
                const smsMsg = document.getElementById('sms-message')?.value || '';
                if (!smsNum) return null;
                let smsto = `smsto:${smsNum}`;
                if (smsMsg) smsto += `:${smsMsg}`;
                return smsto;

            case 'text':
                return document.getElementById('text-content')?.value || '4U.IA.BR';

            case 'crypto':
                const cType = document.getElementById('crypto-type')?.value || 'bitcoin';
                const cAddr = document.getElementById('crypto-address')?.value || '';
                const cAmt = document.getElementById('crypto-amount')?.value || '';
                if (!cAddr) return null;
                let cUri = `${cType}:${cAddr}`;
                if (cAmt) cUri += `?amount=${cAmt}`;
                return cUri;

            default:
                return 'https://4u.ia.br';
        }
    }

    // --- RENDERIZADOR DO QR CODE COM LOGO E MOLDURA ---

    function renderLiveQRCode() {
        const data = collectCurrentData();
        if (!data) {
            if (previewStatusBadge) {
                previewStatusBadge.textContent = 'Preencha os campos';
                previewStatusBadge.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle';
            }
            return;
        }

        currentRawData = data;
        const size = parseInt(qrSizeSelect.value, 10) || 384;
        const colorDark = qrColorInput.value;
        const colorLight = qrBgColorInput.value;

        // Limpar container
        qrCodeCanvasDiv.innerHTML = '';

        try {
            // Gerar base usando qrcodejs
            const tempDiv = document.createElement('div');
            qrcodeInstance = new QRCode(tempDiv, {
                text: data,
                width: size,
                height: size,
                colorDark: colorDark,
                colorLight: colorLight,
                correctLevel: QRCode.CorrectLevel.H // Nível H permite sobreposição de logo no centro
            });

            setTimeout(() => {
                const baseCanvas = tempDiv.querySelector('canvas');
                if (!baseCanvas) return;

                // Criar Canvas Composto com Logo e Moldura
                applyCustomizationsAndDisplay(baseCanvas, size, colorDark, colorLight);

                if (previewStatusBadge) {
                    previewStatusBadge.textContent = 'Pronto';
                    previewStatusBadge.className = 'badge bg-success-subtle text-success border border-success-subtle';
                }

                // Salvar no Histórico Local
                saveToHistory(contentTypeSelect.value, data);
            }, 50);

        } catch (err) {
            console.error('Erro na renderização:', err);
            if (previewStatusBadge) {
                previewStatusBadge.textContent = 'Erro';
                previewStatusBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle';
            }
        }
    }

    function applyCustomizationsAndDisplay(baseCanvas, size, colorDark, colorLight) {
        // 1. Criar cópia editável do canvas base
        const workingCanvas = document.createElement('canvas');
        workingCanvas.width = size;
        workingCanvas.height = size;
        const wCtx = workingCanvas.getContext('2d');
        wCtx.drawImage(baseCanvas, 0, 0);

        // 2. Desenhar Logotipo no Centro se selecionado
        if (selectedLogo !== 'none') {
            drawLogoOnCanvas(workingCanvas, selectedLogo, customLogoImg);
        }

        // 3. Desenhar Moldura se selecionada
        let finalCanvas = workingCanvas;
        if (selectedFrame !== 'none') {
            let frameText = 'ESCANEIE AQUI';
            let frameColor = colorDark;

            if (selectedFrame === 'scanme') {
                frameText = 'ESCANEIE AQUI';
            } else if (selectedFrame === 'pix') {
                frameText = 'PAGUE COM PIX';
                frameColor = '#10b981';
            } else if (selectedFrame === 'wifi') {
                frameText = 'CONECTE-SE AO WI-FI';
                frameColor = '#00d4ff';
            } else if (selectedFrame === 'custom') {
                frameText = (customFrameText?.value || 'ESCANEIE AQUI').toUpperCase();
            }

            finalCanvas = createFramedCanvas(workingCanvas, frameText, frameColor);
        }

        currentFinalCanvas = finalCanvas;

        // Exibir no preview
        qrCodeCanvasDiv.innerHTML = '';
        qrCodeCanvasDiv.appendChild(finalCanvas);
    }

    /**
     * Desenha logo no centro do QR Code
     */
    function drawLogoOnCanvas(canvas, logoType, customImg) {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const logoSize = Math.round(size * 0.22);
        const center = size / 2;
        const half = logoSize / 2;

        // Fundo circular com borda e sombra suave
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, half + 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();

        // Borda fina
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, half + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Conteúdo do logo
        if (logoType === 'custom' && customImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(center, center, half, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(customImg, center - half, center - half, logoSize, logoSize);
            ctx.restore();
        } else {
            drawPresetIcon(ctx, logoType, center, center, logoSize);
        }
    }

    /**
     * Desenha ícones vetoriais de alta nitidez no canvas
     */
    function drawPresetIcon(ctx, type, cx, cy, size) {
        const r = size / 2;
        ctx.save();

        if (type === 'pix') {
            // Fundo Pix Teal
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#32bcad';
            ctx.fill();

            // Losango / Cruz Pix
            ctx.fillStyle = '#ffffff';
            ctx.translate(cx, cy);
            ctx.rotate(45 * Math.PI / 180);
            const w = size * 0.38;
            ctx.fillRect(-w/2, -w/2, w, w);
        } else if (type === 'whatsapp') {
            // Fundo WhatsApp Verde
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#25d366';
            ctx.fill();

            // Balão de fala
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            // Telefone central
            ctx.fillStyle = '#25d366';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
            ctx.fill();
        } else if (type === 'wifi') {
            // Fundo Wi-Fi Azul
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#00d4ff';
            ctx.fill();

            // Ondas Wi-Fi
            ctx.strokeStyle = '#05131f';
            ctx.lineWidth = size * 0.08;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy + r*0.2, r * 0.45, Math.PI * 1.25, Math.PI * 1.75);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy + r*0.2, r * 0.25, Math.PI * 1.25, Math.PI * 1.75);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy + r*0.25, r * 0.08, 0, Math.PI * 2);
            ctx.fillStyle = '#05131f';
            ctx.fill();
        } else if (type === 'instagram') {
            // Gradiente Instagram
            const grad = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
            grad.addColorStop(0, '#f58529');
            grad.addColorStop(0.5, '#dd2a7b');
            grad.addColorStop(1, '#8134af');
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            // Câmera
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = size * 0.07;
            const b = size * 0.42;
            ctx.strokeRect(cx - b/2, cy - b/2, b, b);
            ctx.beginPath();
            ctx.arc(cx, cy, b * 0.28, 0, Math.PI * 2);
            ctx.stroke();
        } else if (type === '4u') {
            // 4U Brand
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#00d4ff';
            ctx.font = `bold ${Math.round(size * 0.45)}px 'Orbitron', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('4U', cx, cy + 1);
        }

        ctx.restore();
    }

    /**
     * Moldura de Impressão estilo Balcão (Scan Me)
     */
    function createFramedCanvas(baseCanvas, text, frameColor) {
        const padding = Math.round(baseCanvas.width * 0.06);
        const footerHeight = Math.round(baseCanvas.width * 0.16);
        const w = baseCanvas.width + (padding * 2);
        const h = baseCanvas.height + padding + footerHeight;

        const framed = document.createElement('canvas');
        framed.width = w;
        framed.height = h;
        const ctx = framed.getContext('2d');

        // Fundo do card
        ctx.fillStyle = '#ffffff';
        drawRoundRect(ctx, 0, 0, w, h, 18);
        ctx.fill();

        // Borda externa
        ctx.strokeStyle = frameColor;
        ctx.lineWidth = 3;
        drawRoundRect(ctx, 1.5, 1.5, w - 3, h - 3, 18);
        ctx.stroke();

        // Desenhar QR Code no centro
        ctx.drawImage(baseCanvas, padding, padding);

        // Faixa de chamada no rodapé
        const pillY = baseCanvas.height + padding + 6;
        const pillH = footerHeight - 12;
        const pillW = w - (padding * 2);

        ctx.fillStyle = frameColor;
        drawRoundRect(ctx, padding, pillY, pillW, pillH, 10);
        ctx.fill();

        // Texto da faixa
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(pillH * 0.42)}px 'Inter', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, w / 2, pillY + (pillH / 2));

        return framed;
    }

    function drawRoundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // --- EXPORTAÇÃO & DOWNLOAD ---

    window.downloadQRCode = function(format) {
        if (!currentFinalCanvas) return;

        if (format === 'png') {
            const link = document.createElement('a');
            link.download = `qrcode-4u-${Date.now()}.png`;
            link.href = currentFinalCanvas.toDataURL('image/png');
            link.click();
            showToast('Download do PNG iniciado!');
        } else if (format === 'svg') {
            const dataUrl = currentFinalCanvas.toDataURL('image/png');
            const w = currentFinalCanvas.width;
            const h = currentFinalCanvas.height;
            const svgContent = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image href="${dataUrl}" width="${w}" height="${h}"/>
</svg>`;
            const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
            const link = document.createElement('a');
            link.download = `qrcode-4u-${Date.now()}.svg`;
            link.href = URL.createObjectURL(blob);
            link.click();
            showToast('Download do SVG vetorial iniciado!');
        }
    };

    window.copyPixCode = function() {
        if (!pixPayloadText || !pixPayloadText.value) return;
        navigator.clipboard.writeText(pixPayloadText.value).then(() => {
            showToast('Código PIX Copia e Cola copiado com sucesso! 💠');
        }).catch(() => {
            pixPayloadText.select();
            document.execCommand('copy');
            showToast('Código PIX copiado!');
        });
    };

    window.copyRawQRCodeData = function() {
        if (!currentRawData) return;
        navigator.clipboard.writeText(currentRawData).then(() => {
            showToast('Dados do QR Code copiados para a área de transferência!');
        });
    };

    // --- IMPRESSÃO DE DISPLAY DE MESA ---

    window.openPrintDisplayModal = function() {
        if (!currentFinalCanvas) return;
        const target = document.getElementById('printQrTarget');
        if (target) {
            target.innerHTML = '';
            const img = new Image();
            img.src = currentFinalCanvas.toDataURL('image/png');
            target.appendChild(img);
        }
        updatePrintSheetText();
        const modal = new bootstrap.Modal(document.getElementById('printDisplayModal'));
        modal.show();
    };

    window.updatePrintSheetText = function() {
        const title = document.getElementById('printTitleInput')?.value || 'CONECTE-SE / PAGUE AQUI';
        const cardTitle = document.getElementById('printCardTitle');
        if (cardTitle) cardTitle.textContent = title.toUpperCase();
    };

    window.triggerNativePrint = function() {
        window.print();
    };

    // --- HISTÓRICO LOCAL ---

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
            if (raw) historyData = JSON.parse(raw);
            const countEl = document.getElementById('historyCount');
            if (countEl) countEl.textContent = historyData.length;
        } catch (e) {}
    }

    function saveToHistory(type, data) {
        if (!data || data.length < 5) return;
        try {
            // Evitar duplicatas consecutivas
            if (historyData.length > 0 && historyData[0].data === data) return;

            const item = {
                id: Date.now(),
                type: type.toUpperCase(),
                data: data,
                timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            };

            historyData.unshift(item);
            if (historyData.length > 12) historyData.pop();
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historyData));

            const countEl = document.getElementById('historyCount');
            if (countEl) countEl.textContent = historyData.length;
        } catch (e) {}
    }

    window.openHistoryModal = function() {
        const container = document.getElementById('historyListContainer');
        if (!container) return;
        container.innerHTML = '';

        if (historyData.length === 0) {
            container.innerHTML = '<p class="text-center text-secondary py-4 mb-0">Nenhum QR Code gerado recentemente.</p>';
        } else {
            historyData.forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <div>
                        <span class="badge bg-primary me-2">${item.type}</span>
                        <strong class="text-light" style="font-size:0.9rem;">${item.data.substring(0, 45)}${item.data.length > 45 ? '...' : ''}</strong>
                    </div>
                    <small class="text-muted">${item.timestamp}</small>
                `;
                div.addEventListener('click', () => {
                    restoreFromHistory(item);
                    bootstrap.Modal.getInstance(document.getElementById('historyModal'))?.hide();
                });
                container.appendChild(div);
            });
        }

        const modal = new bootstrap.Modal(document.getElementById('historyModal'));
        modal.show();
    };

    function restoreFromHistory(item) {
        if (item.type === 'URL') {
            contentTypeSelect.value = 'url';
            document.getElementById('url-link').value = item.data;
        } else if (item.type === 'PIX') {
            contentTypeSelect.value = 'pix';
        } else {
            contentTypeSelect.value = 'text';
            document.getElementById('text-content').value = item.data;
        }
        contentTypeSelect.dispatchEvent(new Event('change'));
        showToast('QR Code restaurado do histórico!');
    }

    window.clearAllHistory = function() {
        historyData = [];
        localStorage.removeItem(STORAGE_KEY_HISTORY);
        const countEl = document.getElementById('historyCount');
        if (countEl) countEl.textContent = '0';
        openHistoryModal();
        showToast('Histórico limpo com sucesso.');
    };

    // --- SCANNER / LEITOR (HTML5-QRCODE) ---

    window.switchMainTab = function(tab) {
        const genBtn = document.getElementById('tabBtnGenerator');
        const scanBtn = document.getElementById('tabBtnScanner');
        const genSec = document.getElementById('generatorSection');
        const scanSec = document.getElementById('scannerSection');

        if (tab === 'generator') {
            genBtn.classList.add('active');
            scanBtn.classList.remove('active');
            genSec.style.display = 'block';
            scanSec.style.display = 'none';
            stopCameraScanner();
        } else if (tab === 'scanner') {
            scanBtn.classList.add('active');
            genBtn.classList.remove('active');
            genSec.style.display = 'none';
            scanSec.style.display = 'block';
        }
    };

    window.startCameraScanner = function() {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('scanner-reader');
        }

        document.getElementById('btnStartCamera').style.display = 'none';
        document.getElementById('btnStopCamera').style.display = 'inline-block';
        document.getElementById('scannerLaser').style.display = 'block';

        const config = { fps: 12, qrbox: { width: 240, height: 240 } };
        html5QrCode.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => onScanSuccess(decodedText),
            (err) => {}
        ).catch(err => {
            console.warn('Erro ao abrir câmera:', err);
            showToast('Permissão de câmera negada ou dispositivo indisponível.');
            stopCameraScanner();
        });
    };

    window.stopCameraScanner = function() {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                document.getElementById('btnStartCamera').style.display = 'inline-block';
                document.getElementById('btnStopCamera').style.display = 'none';
                document.getElementById('scannerLaser').style.display = 'none';
            }).catch(() => {});
        } else {
            const startBtn = document.getElementById('btnStartCamera');
            const stopBtn = document.getElementById('btnStopCamera');
            if (startBtn) startBtn.style.display = 'inline-block';
            if (stopBtn) stopBtn.style.display = 'none';
            const laser = document.getElementById('scannerLaser');
            if (laser) laser.style.display = 'none';
        }
    };

    window.scanImageFile = function(input) {
        if (!input.files || input.files.length === 0) return;
        const file = input.files[0];

        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode('scanner-reader');
        }

        html5QrCode.scanFile(file, true)
            .then(decodedText => onScanSuccess(decodedText))
            .catch(err => {
                showToast('Nenhum QR Code legível foi detectado na imagem selecionada.');
            });
    };

    function onScanSuccess(decodedText) {
        playBeep();
        const box = document.getElementById('scannerResultBox');
        const textEl = document.getElementById('scannerDecodedText');
        const btnOpen = document.getElementById('btnOpenScannedUrl');

        if (box && textEl) {
            box.style.display = 'block';
            textEl.textContent = decodedText;

            if (decodedText.startsWith('http://') || decodedText.startsWith('https://')) {
                btnOpen.href = decodedText;
                btnOpen.style.display = 'inline-flex';
            } else {
                btnOpen.style.display = 'none';
            }
        }
        showToast('QR Code detectado com sucesso! ✅');
    }

    window.copyScannedText = function() {
        const text = document.getElementById('scannerDecodedText')?.textContent;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Conteúdo lido copiado para a área de transferência!');
        });
    };

    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        } catch (e) {}
    }

    // --- TOAST NOTIFICATIONS ---
    function showToast(msg) {
        const toastEl = document.getElementById('studioToast');
        const msgEl = document.getElementById('toastMessage');
        if (toastEl && msgEl) {
            msgEl.textContent = msg;
            const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
            toast.show();
        }
    }
});
