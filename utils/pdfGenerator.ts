import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Job, EstimateData, Settings, PurchaseOrder, PurchaseOrderItem } from '../types';
import { formatCurrency, formatDateIndo } from './helpers';

// Helper for Header
const addHeader = (doc: any, settings: Settings) => {
  const pageWidth = doc.internal.pageSize.width;
  const wsName = settings.workshopName || "MAZDA RANGER BODY & PAINT";
  const wsAddress = settings.workshopAddress || "Jl. Pangeran Antasari No. 12, Jakarta Selatan";
  const wsPhone = settings.workshopPhone || "(021) 750-9999";
  const wsEmail = settings.workshopEmail || "service@mazdaranger.com";

  // Workshop Name
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(44, 62, 80); // Dark Slate
  doc.text(wsName, 15, 20);
  
  // Address & Contact
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(wsAddress, 15, 25);
  doc.text(`Telp: ${wsPhone} | Email: ${wsEmail}`, 15, 29);
  
  // Separator Line
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(15, 34, pageWidth - 15, 34);
};

export const generateEstimationPDF = (job: Job, estimateData: EstimateData, settings: Settings, creatorName?: string) => {
  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  
  addHeader(doc, settings);

  // --- TITLE & NUMBER ---
  const isWO = !!job.woNumber;
  
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text(isWO ? "WORK ORDER" : "ESTIMASI BIAYA", pageWidth - 15, 25, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  if (isWO) {
      doc.text(`#${job.woNumber}`, pageWidth - 15, 30, { align: 'right' });
  } else {
      doc.text(`#${estimateData.estimationNumber || 'DRAFT'}`, pageWidth - 15, 30, { align: 'right' });
  }
  
  doc.setFontSize(9);
  doc.text(formatDateIndo(new Date()), pageWidth - 15, 34, { align: 'right' });

  // --- CUSTOMER & VEHICLE INFO ---
  const startY = 45;
  
  doc.setFillColor(245, 247, 250);
  doc.rect(15, 40, pageWidth - 30, 28, 'F');
  
  // Kolom Kiri (Customer)
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text("DATA PELANGGAN", 20, 46);
  
  doc.setFont("helvetica", "normal");
  doc.text(`Nama: ${job.customerName}`, 20, 52);
  doc.text(`Telp: ${job.customerPhone || '-'}`, 20, 57);
  doc.text(`Asuransi: ${job.namaAsuransi}`, 20, 62);
  
  // Kolom Kanan (Vehicle)
  const rightColX = pageWidth / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.text("DATA KENDARAAN", rightColX, 46);
  
  doc.setFont("helvetica", "normal");
  doc.text(`No. Polisi: ${job.policeNumber}`, rightColX, 52);
  doc.text(`Merk: ${job.carBrand || 'Mazda'} - ${job.carModel}`, rightColX, 57);
  doc.text(`Warna: ${job.warnaMobil}`, rightColX, 62);
  
  // --- TABLE JASA ---
  let currentY = startY + 30;
  
  doc.setFont("helvetica", "bold");
  doc.text("A. JASA PERBAIKAN", 15, currentY);
  currentY += 2;
  
  const jasaRows = estimateData.jasaItems.map((item, index) => [
    index + 1,
    item.name,
    formatCurrency(item.price)
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Uraian Pekerjaan', 'Biaya (Rp)']],
    body: jasaRows,
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], textColor: 50, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });

  currentY = doc.lastAutoTable.finalY + 10;

  // --- TABLE PARTS ---
  doc.setFont("helvetica", "bold");
  doc.text("B. SPAREPART & BAHAN", 15, currentY);
  currentY += 2;

  const partRows = estimateData.partItems.map((item, index) => [
    index + 1,
    item.number || '-',
    item.name,
    item.qty || 1,
    formatCurrency(item.price),
    formatCurrency((item.price || 0) * (item.qty || 1))
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'No. Part', 'Nama Sparepart', 'Qty', 'Harga @', 'Total (Rp)']],
    body: partRows,
    theme: 'plain',
    headStyles: { fillColor: [240, 240, 240], textColor: 50, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });

  currentY = doc.lastAutoTable.finalY + 10;

  // --- SUMMARY CALCULATION ---
  if (currentY > 220) {
      doc.addPage();
      currentY = 20;
  }

  const summaryX = pageWidth - 90;
  const valX = pageWidth - 15;
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  // Subtotal Jasa
  doc.text("Subtotal Jasa:", summaryX, currentY);
  doc.text(formatCurrency(estimateData.subtotalJasa), valX, currentY, { align: 'right' });
  currentY += 5;
  
  // Disc Jasa
  if (estimateData.discountJasa > 0) {
      doc.setTextColor(200, 0, 0);
      doc.text(`Diskon Jasa (${estimateData.discountJasa}%):`, summaryX, currentY);
      doc.text(`(${formatCurrency(estimateData.discountJasaAmount)})`, valX, currentY, { align: 'right' });
      doc.setTextColor(0);
      currentY += 5;
  }

  // Subtotal Part
  doc.text("Subtotal Part:", summaryX, currentY);
  doc.text(formatCurrency(estimateData.subtotalPart), valX, currentY, { align: 'right' });
  currentY += 5;

  // Disc Part
  if (estimateData.discountPart > 0) {
      doc.setTextColor(200, 0, 0);
      doc.text(`Diskon Part (${estimateData.discountPart}%):`, summaryX, currentY);
      doc.text(`(${formatCurrency(estimateData.discountPartAmount)})`, valX, currentY, { align: 'right' });
      doc.setTextColor(0);
      currentY += 5;
  }

  // Line
  doc.setDrawColor(200);
  doc.line(summaryX, currentY, valX, currentY);
  currentY += 5;

  // DPP
  doc.setFont("helvetica", "bold");
  doc.text("DPP:", summaryX, currentY);
  doc.text(formatCurrency(estimateData.subtotalJasa + estimateData.subtotalPart - estimateData.discountJasaAmount - estimateData.discountPartAmount), valX, currentY, { align: 'right' });
  currentY += 6;

  // PPN
  doc.setFont("helvetica", "normal");
  doc.text(`PPN (${settings.ppnPercentage}%):`, summaryX, currentY);
  doc.text(formatCurrency(estimateData.ppnAmount), valX, currentY, { align: 'right' });
  currentY += 8;

  // GRAND TOTAL
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("GRAND TOTAL:", summaryX, currentY);
  doc.text(formatCurrency(estimateData.grandTotal), valX, currentY, { align: 'right' });

  // --- FOOTER / SIGNATURE ---
  const signY = currentY + 30;
  if (signY < 270) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      const col1 = 30;
      doc.text("Hormat Kami,", col1, signY, {align: 'center'});
      doc.text(`( ${creatorName || 'Admin'} )`, col1, signY + 25, {align: 'center'});

      const col3 = pageWidth - 50;
      doc.text("Disetujui Oleh,", col3, signY, {align: 'center'});
      doc.text(`( ${job.customerName} )`, col3, signY + 25, {align: 'center'});
  }

  const fileName = `${isWO ? job.woNumber : (estimateData.estimationNumber || 'ESTIMASI')}_${job.policeNumber}.pdf`;
  doc.save(fileName);
};

export const generatePurchaseOrderPDF = (po: PurchaseOrder, settings: Settings) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    addHeader(doc, settings);

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(33, 33, 33);
    doc.text("PURCHASE ORDER", 15, 48);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(po.status.toUpperCase(), 15, 54);

    const infoX = pageWidth - 80;
    doc.setFontSize(9);
    doc.setTextColor(50);
    
    doc.text("No. PO", infoX, 48);
    doc.text(`: ${po.poNumber}`, infoX + 25, 48);
    
    const poDate = po.createdAt ? formatDateIndo(po.createdAt) : formatDateIndo(new Date());
    doc.text("Tanggal", infoX, 53);
    doc.text(`: ${poDate === '-' ? formatDateIndo(new Date()) : poDate}`, infoX + 25, 53);
    
    doc.text("Dibuat Oleh", infoX, 58);
    doc.text(`: ${po.createdBy || 'Admin'}`, infoX + 25, 58);

    const supplierY = 65;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text("VENDOR / SUPPLIER:", 15, supplierY);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(po.supplierName, 15, supplierY + 5);

    const tableBody = po.items.map((item, idx) => [
        idx + 1,
        item.code,
        item.brand ? `${item.name} (${item.brand})` : item.name,
        `${item.qty} ${item.unit}`,
        formatCurrency(item.price),
        formatCurrency(item.total)
    ]);

    autoTable(doc, {
        startY: 80,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty', 'Harga Satuan', 'Total']],
        body: tableBody,
        theme: 'striped',
        headStyles: { 
            fillColor: [52, 73, 94], 
            textColor: 255, 
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: { 
            fontSize: 9, 
            cellPadding: 3,
            textColor: 50
        },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            3: { cellWidth: 25, halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right' }
        },
    });

    let finalY = doc.lastAutoTable.finalY + 5;
    const rightX = pageWidth - 15;
    const labelX = pageWidth - 65;

    if (finalY > 240) {
        doc.addPage();
        finalY = 20;
    }

    doc.setFontSize(10);
    doc.setTextColor(50);

    doc.text("Subtotal", labelX, finalY + 5, { align: 'right' });
    doc.text(formatCurrency(po.subtotal), rightX, finalY + 5, { align: 'right' });

    let currentY = finalY + 5;

    if (po.hasPpn) {
        currentY += 5;
        doc.text(`PPN (${settings.ppnPercentage}%)`, labelX, currentY, { align: 'right' });
        doc.text(formatCurrency(po.ppnAmount), rightX, currentY, { align: 'right' });
    }

    currentY += 3;
    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(labelX - 20, currentY, rightX, currentY);

    currentY += 7;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0); 
    doc.text("GRAND TOTAL", labelX, currentY, { align: 'right' });
    doc.text(formatCurrency(po.totalAmount), rightX, currentY, { align: 'right' });

    let footerY = currentY + 15;

    if(po.notes) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(50);
        doc.text("Catatan:", 15, footerY);
        doc.setFont("helvetica", "normal");
        doc.text(po.notes, 15, footerY + 5);
        footerY += 15;
    }

    const signY = footerY + 10;
    if (signY > 260) doc.addPage();

    doc.setFontSize(10);
    doc.setTextColor(0);

    doc.text("Dibuat Oleh,", 30, signY, {align: 'center'});
    doc.text("( Partman / Staff )", 30, signY + 25, {align: 'center'});

    doc.text("Disetujui Oleh,", pageWidth - 40, signY, {align: 'center'});
    doc.text("( Manager )", pageWidth - 40, signY + 25, {align: 'center'});

    doc.save(`${po.poNumber}.pdf`);
};

export const generateReceivingReportPDF = (
    po: PurchaseOrder, 
    receivedItems: {item: PurchaseOrderItem, qtyReceivedNow: number}[], 
    settings: Settings,
    receiverName: string
) => {
    const doc: any = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    addHeader(doc, settings);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    // FIXED: REMOVED (GR) AS REQUESTED
    doc.text("BUKTI SERAH TERIMA BARANG", pageWidth / 2, 45, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Ref PO: ${po.poNumber}`, 15, 55);
    doc.text(`Supplier: ${po.supplierName}`, 15, 60);
    doc.text(`Tanggal Terima: ${formatDateIndo(new Date())}`, pageWidth - 15, 55, { align: 'right' });
    doc.text(`Penerima: ${receiverName}`, pageWidth - 15, 60, { align: 'right' });

    const tableBody = receivedItems.map((entry, idx) => [
        idx + 1,
        entry.item.code,
        entry.item.brand ? `${entry.item.name} (${entry.item.brand})` : entry.item.name,
        `${entry.qtyReceivedNow} ${entry.item.unit}`
    ]);

    autoTable(doc, {
        startY: 70,
        head: [['No', 'Kode Part', 'Deskripsi Barang', 'Qty Diterima']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [52, 73, 94] }, 
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            3: { cellWidth: 30, halign: 'center' }
        }
    });

    const finalY = doc.lastAutoTable.finalY + 20;

    doc.setFontSize(10);
    doc.text("Diserahkan Oleh,", 30, finalY, {align: 'center'});
    doc.text("( Supplier / Kurir )", 30, finalY + 25, {align: 'center'});

    doc.text("Diterima Oleh,", pageWidth - 40, finalY, {align: 'center'});
    doc.text(`( ${receiverName} )`, pageWidth - 40, finalY + 25, {align: 'center'});

    doc.save(`GR_${po.poNumber}_${new Date().getTime()}.pdf`);
};