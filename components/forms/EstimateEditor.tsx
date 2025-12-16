import React, { useState, useEffect } from 'react';
import { Job, EstimateItem, EstimateData, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { generateEstimationPDF } from '../../utils/pdfGenerator';
import { Plus, Trash2, Save, Calculator, AlertCircle, Download } from 'lucide-react';

interface EstimateEditorProps {
  job: Job;
  ppnPercentage: number;
  insuranceOptions: { name: string; jasa: number; part: number }[];
  onSave: (jobId: string, estimateData: EstimateData) => Promise<string>; // Returns the generated ID
  onCancel: () => void;
  settings?: Settings; // Added settings for PDF header info
}

const EstimateEditor: React.FC<EstimateEditorProps> = ({ job, ppnPercentage, insuranceOptions, onSave, onCancel, settings }) => {
  const [jasaItems, setJasaItems] = useState<EstimateItem[]>([]);
  const [partItems, setPartItems] = useState<EstimateItem[]>([]);
  const [discountJasa, setDiscountJasa] = useState(0);
  const [discountPart, setDiscountPart] = useState(0);
  const [existingEstimationNumber, setExistingEstimationNumber] = useState<string | undefined>(undefined);
  
  const [totals, setTotals] = useState({
    subtotalJasa: 0, subtotalPart: 0,
    discJasaRp: 0, discPartRp: 0,
    dpp: 0, ppn: 0, grandTotal: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize data
  useEffect(() => {
    // Cek apakah sudah ada data estimasi tersimpan sebelumnya
    const hasExistingData = job.estimateData && (
        (job.estimateData.jasaItems && job.estimateData.jasaItems.length > 0) || 
        (job.estimateData.partItems && job.estimateData.partItems.length > 0) ||
        job.estimateData.grandTotal > 0
    );

    if (hasExistingData && job.estimateData) {
      // LOAD EXISTING DATA
      setJasaItems(job.estimateData.jasaItems || []);
      setPartItems(job.estimateData.partItems || []);
      setDiscountJasa(job.estimateData.discountJasa || 0);
      setDiscountPart(job.estimateData.discountPart || 0);
      setExistingEstimationNumber(job.estimateData.estimationNumber);
    } else {
      // NEW ESTIMATE: Auto-fill discounts from Insurance Master Data
      const matchedInsurance = insuranceOptions.find(ins => ins.name === job.namaAsuransi);
      
      if (matchedInsurance) {
          setDiscountJasa(matchedInsurance.jasa || 0);
          setDiscountPart(matchedInsurance.part || 0);
      } else {
          setDiscountJasa(0);
          setDiscountPart(0);
      }
      
      setJasaItems([]);
      setPartItems([]);
    }
  }, [job, insuranceOptions]);

  // Recalculate totals whenever items or discounts change
  useEffect(() => {
    const subJasa = jasaItems.reduce((acc, item) => acc + (item.price || 0), 0);
    const subPart = partItems.reduce((acc, item) => acc + ((item.price || 0) * (item.qty || 1)), 0);

    const discJasaRp = (subJasa * discountJasa) / 100;
    const discPartRp = (subPart * discountPart) / 100;

    const totalJasaNet = subJasa - discJasaRp;
    const totalPartNet = subPart - discPartRp;

    const dpp = totalJasaNet + totalPartNet;
    const ppn = (dpp * ppnPercentage) / 100;
    const grandTotal = dpp + ppn;

    setTotals({
      subtotalJasa: subJasa,
      subtotalPart: subPart,
      discJasaRp,
      discPartRp,
      dpp,
      ppn,
      grandTotal
    });
  }, [jasaItems, partItems, discountJasa, discountPart, ppnPercentage]);

  // Handlers for Items
  const addItem = (type: 'jasa' | 'part') => {
    const newItem: EstimateItem = type === 'jasa' 
      ? { name: '', price: 0 }
      : { name: '', price: 0, qty: 1, number: '' };
    
    if (type === 'jasa') setJasaItems([...jasaItems, newItem]);
    else setPartItems([...partItems, newItem]);
  };

  const updateItem = (type: 'jasa' | 'part', index: number, field: keyof EstimateItem, value: any) => {
    if (type === 'jasa') {
      const newItems = [...jasaItems];
      newItems[index] = { ...newItems[index], [field]: value };
      setJasaItems(newItems);
    } else {
      const newItems = [...partItems];
      newItems[index] = { ...newItems[index], [field]: value };
      setPartItems(newItems);
    }
  };

  const removeItem = (type: 'jasa' | 'part', index: number) => {
    if (type === 'jasa') setJasaItems(jasaItems.filter((_, i) => i !== index));
    else setPartItems(partItems.filter((_, i) => i !== index));
  };

  const prepareEstimateData = (estimationNumber?: string): EstimateData => ({
      jasaItems,
      partItems,
      discountJasa,
      discountPart,
      subtotalJasa: totals.subtotalJasa,
      subtotalPart: totals.subtotalPart,
      discountJasaAmount: totals.discJasaRp,
      discountPartAmount: totals.discPartRp,
      ppnAmount: totals.ppn,
      grandTotal: totals.grandTotal,
      estimationNumber: estimationNumber || existingEstimationNumber
  });

  const handleSave = async () => {
    setIsSubmitting(true);
    const data = prepareEstimateData();

    try {
      // Save and get the Generated ID back
      const generatedId = await onSave(job.id, data);
      
      // Update local state with the new ID so PDF uses it
      const finalData = prepareEstimateData(generatedId);
      
      // Download PDF Automatically
      if (settings) {
         generateEstimationPDF(job, finalData, settings);
      }
    } catch (error) {
       console.error("Save failed", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadOnly = () => {
      if (settings) {
          generateEstimationPDF(job, prepareEstimateData(), settings);
      }
  };

  return (
    <div className="space-y-6">
      {/* Header Info Unit */}
      <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-500">No. Polisi</p>
          <p className="font-bold text-gray-900">{job.policeNumber}</p>
        </div>
        <div>
          <p className="text-gray-500">Model Kendaraan</p>
          <p className="font-bold text-gray-900">{job.carModel}</p>
        </div>
        <div>
          <p className="text-gray-500">Pelanggan</p>
          <p className="font-bold text-gray-900">{job.customerName}</p>
        </div>
        <div>
          <p className="text-gray-500">Asuransi</p>
          <p className="font-bold text-indigo-700">{job.namaAsuransi}</p>
        </div>
      </div>
      
      {/* Show Estimation Number if exists */}
      {existingEstimationNumber && (
          <div className="bg-green-50 px-4 py-2 rounded border border-green-200 text-green-800 text-sm font-bold flex items-center justify-between">
              <span>Nomor Estimasi: {existingEstimationNumber}</span>
              <button onClick={handleDownloadOnly} className="flex items-center gap-1 text-green-700 hover:text-green-900 underline text-xs">
                  <Download size={14}/> Download Ulang PDF
              </button>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KOLOM JASA PERBAIKAN */}
        <div className="border rounded-xl p-4 bg-white shadow-sm h-fit">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Calculator size={18} className="text-blue-600"/> Jasa Perbaikan
            </h3>
            <button onClick={() => addItem('jasa')} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-semibold hover:bg-blue-100 transition">
              + Tambah Jasa
            </button>
          </div>
          
          <div className="space-y-3">
            {jasaItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <input 
                  type="text" 
                  placeholder="Nama Pekerjaan (Panel)" 
                  className="flex-grow p-2 border rounded text-sm focus:ring-1 ring-blue-500"
                  value={item.name}
                  onChange={e => updateItem('jasa', idx, 'name', e.target.value)}
                />
                <input 
                  type="number" 
                  placeholder="Harga" 
                  className="w-32 p-2 border rounded text-sm text-right focus:ring-1 ring-blue-500"
                  value={item.price || ''}
                  onChange={e => updateItem('jasa', idx, 'price', Number(e.target.value))}
                />
                <button onClick={() => removeItem('jasa', idx)} className="p-2 text-red-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {jasaItems.length === 0 && <p className="text-gray-400 text-center text-sm italic py-4">Belum ada item jasa</p>}
          </div>

          <div className="mt-4 pt-4 border-t space-y-2">
             <div className="flex justify-between text-sm">
                <span>Subtotal Jasa</span>
                <span className="font-medium">{formatCurrency(totals.subtotalJasa)}</span>
             </div>
             <div className="flex justify-between items-center text-sm bg-blue-50 p-2 rounded">
                <span className="text-blue-800 font-semibold">Diskon Jasa (%)</span>
                <input 
                  type="number" 
                  min="0" max="100" 
                  className="w-16 p-1 border border-blue-200 rounded text-right text-xs font-bold text-blue-800"
                  value={discountJasa}
                  onChange={e => setDiscountJasa(Number(e.target.value))}
                />
             </div>
             <div className="flex justify-between text-sm font-bold text-blue-700 pt-2 border-t border-dashed">
                <span>Total Jasa Netto</span>
                <span>{formatCurrency(totals.subtotalJasa - totals.discJasaRp)}</span>
             </div>
          </div>
        </div>

        {/* KOLOM SPAREPART */}
        <div className="border rounded-xl p-4 bg-white shadow-sm h-fit">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Calculator size={18} className="text-orange-600"/> Sparepart / Bahan
            </h3>
            <button onClick={() => addItem('part')} className="text-xs bg-orange-50 text-orange-600 px-3 py-1 rounded-full font-semibold hover:bg-orange-100 transition">
              + Tambah Part
            </button>
          </div>
          
          <div className="space-y-3">
            {partItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-start flex-wrap sm:flex-nowrap">
                <input 
                  type="text" 
                  placeholder="No. Part" 
                  className="w-24 p-2 border rounded text-sm focus:ring-1 ring-orange-500"
                  value={item.number || ''}
                  onChange={e => updateItem('part', idx, 'number', e.target.value)}
                />
                <input 
                  type="text" 
                  placeholder="Nama Sparepart" 
                  className="flex-grow p-2 border rounded text-sm focus:ring-1 ring-orange-500"
                  value={item.name}
                  onChange={e => updateItem('part', idx, 'name', e.target.value)}
                />
                <input 
                  type="number" 
                  placeholder="Qty" 
                  className="w-16 p-2 border rounded text-sm text-center focus:ring-1 ring-orange-500"
                  value={item.qty || ''}
                  onChange={e => updateItem('part', idx, 'qty', Number(e.target.value))}
                />
                <input 
                  type="number" 
                  placeholder="Harga Satuan" 
                  className="w-28 p-2 border rounded text-sm text-right focus:ring-1 ring-orange-500"
                  value={item.price || ''}
                  onChange={e => updateItem('part', idx, 'price', Number(e.target.value))}
                />
                <button onClick={() => removeItem('part', idx)} className="p-2 text-red-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {partItems.length === 0 && <p className="text-gray-400 text-center text-sm italic py-4">Belum ada item sparepart</p>}
          </div>

          <div className="mt-4 pt-4 border-t space-y-2">
             <div className="flex justify-between text-sm">
                <span>Subtotal Part</span>
                <span className="font-medium">{formatCurrency(totals.subtotalPart)}</span>
             </div>
             <div className="flex justify-between items-center text-sm bg-orange-50 p-2 rounded">
                <span className="text-orange-800 font-semibold">Diskon Part (%)</span>
                <input 
                  type="number" 
                  min="0" max="100" 
                  className="w-16 p-1 border border-orange-200 rounded text-right text-xs font-bold text-orange-800"
                  value={discountPart}
                  onChange={e => setDiscountPart(Number(e.target.value))}
                />
             </div>
             <div className="flex justify-between text-sm font-bold text-orange-700 pt-2 border-t border-dashed">
                <span>Total Part Netto</span>
                <span>{formatCurrency(totals.subtotalPart - totals.discPartRp)}</span>
             </div>
          </div>
        </div>
      </div>

      {/* FOOTER TOTAL */}
      <div className="bg-gray-900 text-white p-6 rounded-xl shadow-lg mt-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-start gap-3 opacity-80 text-sm">
                <AlertCircle size={20} className="mt-0.5" />
                <p className="max-w-xs">Pastikan semua item telah sesuai dengan fisik kendaraan dan persetujuan pelanggan sebelum menyimpan Estimasi ini.</p>
            </div>
            
            <div className="w-full md:w-auto space-y-1">
                <div className="flex justify-between gap-12 text-gray-400 text-sm">
                    <span>DPP (Dasar Pengenaan Pajak)</span>
                    <span>{formatCurrency(totals.dpp)}</span>
                </div>
                <div className="flex justify-between gap-12 text-gray-400 text-sm">
                    <span>PPN ({ppnPercentage}%)</span>
                    <span>{formatCurrency(totals.ppn)}</span>
                </div>
                <div className="flex justify-between gap-12 text-2xl font-bold text-white pt-2 border-t border-gray-700 mt-2">
                    <span>Grand Total</span>
                    <span>{formatCurrency(totals.grandTotal)}</span>
                </div>
            </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button 
          onClick={onCancel}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          disabled={isSubmitting}
        >
          Batal
        </button>
        <button 
          onClick={handleSave}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-70 shadow-lg font-bold"
        >
          {isSubmitting ? <span className="animate-spin">⏳</span> : <Save size={18} />}
          Simpan & Download PDF
        </button>
      </div>
    </div>
  );
};

export default EstimateEditor;
