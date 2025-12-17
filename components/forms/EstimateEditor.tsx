import React, { useState, useEffect } from 'react';
import { Job, EstimateItem, EstimateData, Settings } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { generateEstimationPDF } from '../../utils/pdfGenerator';
import { Plus, Trash2, Save, Calculator, AlertCircle, Download, FileCheck, User } from 'lucide-react';

interface EstimateEditorProps {
  job: Job;
  ppnPercentage: number;
  insuranceOptions: { name: string; jasa: number; part: number }[];
  onSave: (jobId: string, estimateData: EstimateData, saveType: 'estimate' | 'wo') => Promise<string>;
  onCancel: () => void;
  settings?: Settings; 
  creatorName?: string;
}

const EstimateEditor: React.FC<EstimateEditorProps> = ({ job, ppnPercentage, insuranceOptions, onSave, onCancel, settings, creatorName }) => {
  const [jasaItems, setJasaItems] = useState<EstimateItem[]>([]);
  const [partItems, setPartItems] = useState<EstimateItem[]>([]);
  const [discountJasa, setDiscountJasa] = useState(0);
  const [discountPart, setDiscountPart] = useState(0);
  const [existingEstimationNumber, setExistingEstimationNumber] = useState<string | undefined>(undefined);
  const [existingWONumber, setExistingWONumber] = useState<string | undefined>(undefined);
  const [persistedEstimatorName, setPersistedEstimatorName] = useState<string | undefined>(undefined);
  
  const [totals, setTotals] = useState({
    subtotalJasa: 0, subtotalPart: 0,
    discJasaRp: 0, discPartRp: 0,
    dpp: 0, ppn: 0, grandTotal: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize data
  useEffect(() => {
    const hasExistingData = job.estimateData && (
        (job.estimateData.jasaItems && job.estimateData.jasaItems.length > 0) || 
        (job.estimateData.partItems && job.estimateData.partItems.length > 0) ||
        job.estimateData.grandTotal > 0
    );

    if (hasExistingData && job.estimateData) {
      setJasaItems(job.estimateData.jasaItems || []);
      setPartItems(job.estimateData.partItems || []);
      setDiscountJasa(job.estimateData.discountJasa || 0);
      setDiscountPart(job.estimateData.discountPart || 0);
      setExistingEstimationNumber(job.estimateData.estimationNumber);
      setPersistedEstimatorName(job.estimateData.estimatorName);
    } else {
      const matchedInsurance = insuranceOptions.find(ins => ins.name === job.namaAsuransi);
      if (matchedInsurance) {
          setDiscountJasa(matchedInsurance.jasa || 0);
          setDiscountPart(matchedInsurance.part || 0);
      }
    }
    
    // Set WO Number from JOB root data
    setExistingWONumber(job.woNumber);
  }, [job, insuranceOptions]);

  // Recalculate totals
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

    setTotals({ subtotalJasa: subJasa, subtotalPart: subPart, discJasaRp, discPartRp, dpp, ppn, grandTotal });
  }, [jasaItems, partItems, discountJasa, discountPart, ppnPercentage]);

  // Handlers for Items
  const addItem = (type: 'jasa' | 'part') => {
    const newItem: EstimateItem = type === 'jasa' ? { name: '', price: 0 } : { name: '', price: 0, qty: 1, number: '' };
    if (type === 'jasa') setJasaItems([...jasaItems, newItem]);
    else setPartItems([...partItems, newItem]);
  };

  const updateItem = (type: 'jasa' | 'part', index: number, field: keyof EstimateItem, value: any) => {
    const items = type === 'jasa' ? [...jasaItems] : [...partItems];
    items[index] = { ...items[index], [field]: value };
    type === 'jasa' ? setJasaItems(items) : setPartItems(items);
  };

  const removeItem = (type: 'jasa' | 'part', index: number) => {
    type === 'jasa' ? setJasaItems(jasaItems.filter((_, i) => i !== index)) : setPartItems(partItems.filter((_, i) => i !== index));
  };

  const prepareEstimateData = (estimationNumber?: string): EstimateData => {
      const finalEstimatorName = persistedEstimatorName || creatorName || 'Admin';
      return {
        jasaItems, partItems, discountJasa, discountPart,
        subtotalJasa: totals.subtotalJasa, subtotalPart: totals.subtotalPart,
        discountJasaAmount: totals.discJasaRp, discountPartAmount: totals.discPartRp,
        ppnAmount: totals.ppn, grandTotal: totals.grandTotal,
        estimationNumber: estimationNumber || existingEstimationNumber,
        estimatorName: finalEstimatorName
      };
  };

  const handleSave = async (type: 'estimate' | 'wo') => {
    // Confirmation for WO generation
    if (type === 'wo' && !existingWONumber) {
        if (!window.confirm("Terbitkan Work Order (WO)?\n\nTindakan ini akan:\n1. Membuat Nomor WO baru.\n2. Mengubah status kendaraan menjadi 'Work In Progress'.\n3. Membuka akses untuk mekanik mengerjakan unit.")) {
            return;
        }
    }
    
    setIsSubmitting(true);
    const data = prepareEstimateData();

    try {
      // Call parent to save to Firestore and get the generated ID
      const generatedId = await onSave(job.id, data, type);
      
      // Update local state immediately so PDF reflects new numbers
      if (type === 'wo') setExistingWONumber(generatedId);
      if (type === 'estimate') setExistingEstimationNumber(generatedId);
      
      // Prepare temporary job object for PDF generation
      const finalEstimateData = prepareEstimateData(type === 'estimate' ? generatedId : existingEstimationNumber); 
      
      const jobForPDF = { 
          ...job, 
          woNumber: type === 'wo' ? generatedId : existingWONumber,
          // If just generated WO, update local job object status too for PDF context if needed
      };
      
      if (settings) {
         generateEstimationPDF(jobForPDF, finalEstimateData, settings, finalEstimateData.estimatorName);
      }
    } catch (error) {
       console.error("Save failed", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadOnly = () => {
      if (settings) {
          const currentData = prepareEstimateData();
          generateEstimationPDF(job, currentData, settings, currentData.estimatorName);
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
          <p className="text-gray-500">Pelanggan</p>
          <p className="font-bold text-gray-900">{job.customerName}</p>
        </div>
        <div>
           <p className="text-gray-500">Asuransi</p>
           <p className="font-bold text-indigo-700">{job.namaAsuransi}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
            {existingWONumber ? (
                <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200 shadow-sm flex items-center gap-1">
                    <FileCheck size={12}/> WO: {existingWONumber}
                </span>
            ) : existingEstimationNumber ? (
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold border border-blue-200 shadow-sm">
                    Est: {existingEstimationNumber}
                </span>
            ) : (
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold border border-gray-200">
                    New Draft
                </span>
            )}
        </div>
      </div>
      
      {existingEstimationNumber && (
          <div className="bg-gray-50 px-4 py-2 rounded border border-gray-200 text-gray-600 text-sm flex items-center justify-between">
              <span className="flex items-center gap-2"><User size={14}/> Estimator: <strong>{persistedEstimatorName}</strong></span>
              <button onClick={handleDownloadOnly} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 underline text-xs">
                  <Download size={14}/> Download PDF Terakhir
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
              <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                <input type="text" placeholder="Nama Pekerjaan" className="col-span-7 p-2 border rounded text-sm focus:ring-1 ring-blue-500" value={item.name} onChange={e => updateItem('jasa', idx, 'name', e.target.value)} />
                <input type="number" placeholder="Harga" className="col-span-4 p-2 border rounded text-sm text-right focus:ring-1 ring-blue-500" value={item.price || ''} onChange={e => updateItem('jasa', idx, 'price', Number(e.target.value))} />
                <button onClick={() => removeItem('jasa', idx)} className="col-span-1 p-2 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={16} /></button>
              </div>
            ))}
            {jasaItems.length === 0 && <p className="text-gray-400 text-center text-sm italic py-4">Belum ada item jasa</p>}
          </div>

          <div className="mt-4 pt-4 border-t space-y-2">
             <div className="flex justify-between items-center text-sm bg-blue-50 p-2 rounded">
                <span className="text-blue-800 font-semibold">Diskon Jasa (%)</span>
                <input type="number" min="0" max="100" className="w-16 p-1 border border-blue-200 rounded text-right text-xs font-bold text-blue-800" value={discountJasa} onChange={e => setDiscountJasa(Number(e.target.value))} />
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
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input type="text" placeholder="No. Part" className="col-span-2 p-2 border rounded text-sm w-full" value={item.number || ''} onChange={e => updateItem('part', idx, 'number', e.target.value)} />
                <input type="text" placeholder="Nama Sparepart" className="col-span-5 p-2 border rounded text-sm w-full" value={item.name} onChange={e => updateItem('part', idx, 'name', e.target.value)} />
                <input type="number" placeholder="Qty" className="col-span-1 p-2 border rounded text-sm text-center w-full" value={item.qty || ''} onChange={e => updateItem('part', idx, 'qty', Number(e.target.value))} />
                <input type="number" placeholder="Harga" className="col-span-3 p-2 border rounded text-sm text-right w-full" value={item.price || ''} onChange={e => updateItem('part', idx, 'price', Number(e.target.value))} />
                <button onClick={() => removeItem('part', idx)} className="col-span-1 p-2 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={16} /></button>
              </div>
            ))}
            {partItems.length === 0 && <p className="text-gray-400 text-center text-sm italic py-4">Belum ada item sparepart</p>}
          </div>

          <div className="mt-4 pt-4 border-t space-y-2">
             <div className="flex justify-between items-center text-sm bg-orange-50 p-2 rounded">
                <span className="text-orange-800 font-semibold">Diskon Part (%)</span>
                <input type="number" min="0" max="100" className="w-16 p-1 border border-orange-200 rounded text-right text-xs font-bold text-orange-800" value={discountPart} onChange={e => setDiscountPart(Number(e.target.value))} />
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
                <p className="max-w-xs">Grand Total sudah termasuk PPN. Pastikan item dan harga sudah benar sebelum menerbitkan dokumen.</p>
            </div>
            
            <div className="w-full md:w-auto space-y-1">
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

      {/* ACTION BUTTONS */}
      <div className="flex flex-col-reverse md:flex-row justify-end gap-3 pt-2">
        <button 
          onClick={onCancel}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
          disabled={isSubmitting}
        >
          Tutup
        </button>

        {/* LOGIC TOMBOL AKSI */}
        {!existingEstimationNumber ? (
             // CASE 1: Belum ada Estimasi (New Draft)
             <button 
                onClick={() => handleSave('estimate')}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-70 shadow-lg font-bold"
             >
                {isSubmitting ? <span className="animate-spin">⏳</span> : <Save size={18} />}
                Simpan Draft Estimasi
             </button>
        ) : !existingWONumber ? (
             // CASE 2: Ada Estimasi, Belum ada WO (Bisa Update atau Terbitkan WO)
             <>
                <button 
                    onClick={() => handleSave('estimate')}
                    disabled={isSubmitting}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-bold"
                >
                    <Save size={18} /> Update Estimasi
                </button>
                <button 
                    onClick={() => handleSave('wo')}
                    disabled={isSubmitting}
                    className="flex items-center justify-center gap-2 px-8 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-70 shadow-lg font-bold"
                >
                    {isSubmitting ? <span className="animate-spin">⏳</span> : <FileCheck size={18} />}
                    Terbitkan Work Order (WO)
                </button>
             </>
        ) : (
             // CASE 3: Sudah WO (Update Data & Download ulang WO)
             <button 
                onClick={() => handleSave('wo')}
                disabled={isSubmitting}
                className="flex items-center justify-center gap-2 px-8 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-70 shadow-lg font-bold"
             >
                {isSubmitting ? <span className="animate-spin">⏳</span> : <FileCheck size={18} />}
                Update & Download WO
             </button>
        )}
      </div>
    </div>
  );
};

export default EstimateEditor;