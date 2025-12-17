import { Timestamp } from "firebase/firestore";

export const formatCurrency = (number: number | undefined) => 
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(number || 0);

// Format Plat Nomor (Tanpa Spasi, Uppercase)
export const formatPoliceNumber = (value: string) => {
    return value.replace(/\s/g, '').toUpperCase();
};

// Recursive function to remove undefined values for Firestore
export const cleanObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Timestamp || obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanObject(item));
  }

  const newObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      newObj[key] = cleanObject(obj[key]);
    }
  });
  return newObj;
};

// Untuk input type="date" value (Format HTML standar harus YYYY-MM-DD)
export const toYyyyMmDd = (date: any): string => {
    if (!date) return '';
    let d: Date;
    if (date instanceof Timestamp) {
      d = date.toDate();
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      d = date;
    }
    
    if (isNaN(d.getTime())) return '';
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
};

// Untuk Tampilan (Display) format Indonesia (dd/mm/yyyy)
export const formatDateIndo = (date: any): string => {
    if (!date) return '-';
    let d: Date;
    // Handle Firestore Timestamp
    if (date instanceof Timestamp) {
      d = date.toDate();
    } 
    // Handle String ISO
    else if (typeof date === 'string') {
      d = new Date(date);
    } 
    // Handle Date Object
    else {
      d = date;
    }

    if (isNaN(d.getTime())) return '-';

    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
};

export const exportToCsv = (filename: string, rows: any[]) => {
    if (!rows || rows.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
    }
    const separator = ';';
    const processRow = (row: any[]) => {
        let finalVal = '';
        for (let j = 0; j < row.length; j++) {
            let innerValue = row[j] === null || row[j] === undefined ? '' : row[j].toString();
            if (row[j] instanceof Date) innerValue = row[j].toLocaleString('id-ID');
            let result = innerValue.replace(/"/g, '""');
            if (result.search(/("|,|\n)/g) >= 0) result = '"' + result + '"';
            if (j > 0) finalVal += separator;
            finalVal += result;
        }
        return finalVal + '\n';
    };

    const headers = Object.keys(rows[0]);
    let csvFile = 'sep=' + separator + '\n';
    csvFile += processRow(headers);

    for (let i = 0; i < rows.length; i++) {
        csvFile += processRow(Object.values(rows[i]));
    }

    const blob = new Blob(['\uFEFF' + csvFile], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};