import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase, TestRecord, InspectionStatus, CustomField } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
  CircuitBoard,
  Upload,
  Plus,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Camera,
  X,
  Search,
  ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';

type PhotoZone = 'before' | 'after';

export function PCBTesting() {
  const { user, logAudit } = useAuth();
  const fileInputRefs = { before: useRef<HTMLInputElement>(null), after: useRef<HTMLInputElement>(null) };

  const [records, setRecords] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | InspectionStatus>('all');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    barcode: '',
    station_id: '',
    operator_name: user?.full_name || '',
    inspection_date: format(new Date(), 'yyyy-MM-dd'),
    expected_result: '',
    actual_result: '',
    inspection_status: 'Under Analysis' as InspectionStatus,
    failure_type: 'Line Failure Analysis' as 'Line Failure Analysis' | 'Field Failure Analysis',
    inspection_remarks: '',
  });

  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [dragOver, setDragOver] = useState<PhotoZone | null>(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('test_records')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setRecords(data as TestRecord[]);
    setLoading(false);
  };

  const handleFileSelect = useCallback((zone: PhotoZone, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (zone === 'before') setBeforePhoto(result);
      else setAfterPhoto(result);
      setErrorMsg('');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, zone: PhotoZone) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    handleFileSelect(zone, file);
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent, zone: PhotoZone) => {
    e.preventDefault();
    setDragOver(zone);
  };

  const handleDragLeave = () => setDragOver(null);

  const addCustomField = (type: 'text' | 'checkbox') => {
    const newField: CustomField = {
      id: `field-${Date.now()}`,
      label: '',
      type,
      value: type === 'checkbox' ? false : '',
    };
    setCustomFields([...customFields, newField]);
  };

  const updateCustomField = (id: string, updates: Partial<CustomField>) => {
    setCustomFields(customFields.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeCustomField = (id: string) => {
    setCustomFields(customFields.filter(f => f.id !== id));
  };

  const resetForm = () => {
    setFormData({
      barcode: '',
      station_id: '',
      operator_name: user?.full_name || '',
      inspection_date: format(new Date(), 'yyyy-MM-dd'),
      expected_result: '',
      actual_result: '',
      inspection_status: 'Under Analysis',
      failure_type: 'Line Failure Analysis',
      inspection_remarks: '',
    });
    setBeforePhoto(null);
    setAfterPhoto(null);
    setCustomFields([]);
  };

  const handleSave = async () => {
    if (!formData.barcode.trim() || !formData.station_id.trim() || !formData.operator_name.trim()) {
      setErrorMsg('Please fill in PCB Serial, Station ID, and Operator Name');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const { data, error } = await supabase
        .from('test_records')
        .insert({
          barcode: formData.barcode,
          station_id: formData.station_id,
          operator_name: formData.operator_name,
          inspection_date: formData.inspection_date,
          expected_result: formData.expected_result,
          actual_result: formData.actual_result,
          inspection_status: formData.inspection_status,
          failure_type: formData.failure_type,
          inspection_remarks: formData.inspection_remarks,
          before_photo_url: beforePhoto,
          after_photo_url: afterPhoto,
          custom_fields: customFields,
          tested_by: user?.id,
          status: 'Pending',
        })
        .select()
        .single();

      if (error) throw error;

      await logAudit('TEST_RECORD_CREATED', 'test_records', data.id, {
        barcode: formData.barcode,
        station_id: formData.station_id,
        inspection_status: formData.inspection_status,
      });

      setSuccessMsg(
        formData.inspection_status === 'Under Analysis'
          ? 'Record saved as Under Analysis - Pending Approvals count updated'
          : 'Record saved successfully'
      );
      setTimeout(() => setSuccessMsg(''), 4000);
      resetForm();
      fetchRecords();
    } catch (err) {
      console.error('Save error:', err);
      setErrorMsg('Failed to save record. Please try again.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch =
      r.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.station_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.operator_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.inspection_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">E-Cell Manual Inspection</h1>
        <p className="text-sm text-slate-500 mt-1">Enter PCB inspection data with photos and custom fields</p>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm animate-fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Form */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <CircuitBoard className="w-5 h-5 text-accent-600" />
              <h2 className="font-semibold text-slate-800">Inspection Form</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="PCB Serial / Batch Number" required>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                  placeholder="e.g., SN-001-A-001"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Station ID / Line Number" required>
                <input
                  type="text"
                  value={formData.station_id}
                  onChange={e => setFormData({ ...formData, station_id: e.target.value })}
                  placeholder="e.g., STN-F3-01"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Operator Name" required>
                <input
                  type="text"
                  value={formData.operator_name}
                  onChange={e => setFormData({ ...formData, operator_name: e.target.value })}
                  placeholder="Operator name"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Inspection Date">
                <input
                  type="date"
                  value={formData.inspection_date}
                  onChange={e => setFormData({ ...formData, inspection_date: e.target.value })}
                  className={inputClass}
                />
              </FormField>

              <FormField label="Failure Type">
                <select
                  value={formData.failure_type}
                  onChange={e => setFormData({ ...formData, failure_type: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="Line Failure Analysis">Line Failure Analysis</option>
                  <option value="Field Failure Analysis">Field Failure Analysis</option>
                </select>
              </FormField>

              <FormField label="Inspection Status">
                <select
                  value={formData.inspection_status}
                  onChange={e => setFormData({ ...formData, inspection_status: e.target.value as InspectionStatus })}
                  className={inputClass}
                >
                  <option value="Under Analysis">Under Analysis</option>
                  <option value="OK">OK</option>
                  <option value="Not OK">Not OK</option>
                </select>
              </FormField>

              <FormField label="Expected Result">
                <input
                  type="text"
                  value={formData.expected_result}
                  onChange={e => setFormData({ ...formData, expected_result: e.target.value })}
                  placeholder="Expected test outcome"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Actual Result">
                <input
                  type="text"
                  value={formData.actual_result}
                  onChange={e => setFormData({ ...formData, actual_result: e.target.value })}
                  placeholder="Observed outcome"
                  className={inputClass}
                />
              </FormField>

              <div className="md:col-span-2">
                <FormField label="Inspection Remarks">
                  <textarea
                    value={formData.inspection_remarks}
                    onChange={e => setFormData({ ...formData, inspection_remarks: e.target.value })}
                    placeholder="Additional observations and notes..."
                    rows={3}
                    className={inputClass}
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* Photo Upload Zones */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Camera className="w-5 h-5 text-accent-600" />
              <h2 className="font-semibold text-slate-800">Inspection Photos</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PhotoDropZone
                label="Before Inspection Photo"
                photo={beforePhoto}
                dragOver={dragOver === 'before'}
                onDrop={e => handleDrop(e, 'before')}
                onDragOver={e => handleDragOver(e, 'before')}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRefs.before.current?.click()}
                onClear={() => setBeforePhoto(null)}
              />
              <input
                ref={fileInputRefs.before}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleFileSelect('before', e.target.files?.[0])}
              />

              <PhotoDropZone
                label="After Inspection Photo"
                photo={afterPhoto}
                dragOver={dragOver === 'after'}
                onDrop={e => handleDrop(e, 'after')}
                onDragOver={e => handleDragOver(e, 'after')}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRefs.after.current?.click()}
                onClear={() => setAfterPhoto(null)}
              />
              <input
                ref={fileInputRefs.after}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => handleFileSelect('after', e.target.files?.[0])}
              />
            </div>
          </div>

          {/* Custom Fields */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-accent-600" />
                <h2 className="font-semibold text-slate-800">Custom Fields</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addCustomField('text')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-50 text-accent-600 rounded-lg hover:bg-accent-100 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Text Field
                </button>
                <button
                  onClick={() => addCustomField('checkbox')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-50 text-accent-600 rounded-lg hover:bg-accent-100 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Checkbox
                </button>
              </div>
            </div>

            {customFields.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg">
                No custom fields added. Click "Text Field" or "Checkbox" to add.
              </div>
            ) : (
              <div className="space-y-3">
                {customFields.map(field => (
                  <div key={field.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => updateCustomField(field.id, { label: e.target.value })}
                      placeholder="Field label"
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                    {field.type === 'text' ? (
                      <input
                        type="text"
                        value={String(field.value)}
                        onChange={e => updateCustomField(field.id, { value: e.target.value })}
                        placeholder="Value"
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                      />
                    ) : (
                      <label className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(field.value)}
                          onChange={e => updateCustomField(field.id, { value: e.target.checked })}
                          className="w-4 h-4 rounded accent-accent-600"
                        />
                        <span className="text-sm text-slate-600">Checked</span>
                      </label>
                    )}
                    <button
                      onClick={() => removeCustomField(field.id)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={resetForm}
              className="px-5 py-2.5 text-slate-600 hover:text-slate-800 font-medium transition-colors"
            >
              Clear Form
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-accent-600 text-white rounded-lg font-medium hover:bg-accent-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </div>

        {/* Records List */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-5 h-5 text-accent-600" />
              <h2 className="font-semibold text-slate-800">Recent Records</h2>
            </div>

            <div className="space-y-3 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search records..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="all">All Status</option>
                <option value="Under Analysis">Under Analysis</option>
                <option value="OK">OK</option>
                <option value="Not OK">Not OK</option>
              </select>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-accent-500 animate-spin" />
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No records found</div>
              ) : (
                filteredRecords.map(record => (
                  <Link
                    to={`/inspection/${record.id}`}
                    key={record.id}
                    className="block"
                  >
                    <RecordCard record={record} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all';

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function PhotoDropZone({
  label,
  photo,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onClick,
  onClear,
}: {
  label: string;
  photo: string | null;
  dragOver: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      className={`relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all min-h-[200px] flex flex-col items-center justify-center ${
        dragOver
          ? 'border-accent-500 bg-accent-50 scale-[1.02]'
          : photo
          ? 'border-slate-200 bg-slate-50'
          : 'border-slate-300 bg-slate-50 hover:border-accent-400 hover:bg-accent-50/50'
      }`}
    >
      <p className="text-xs font-medium text-slate-500 mb-2 absolute top-3 left-3">{label}</p>

      {photo ? (
        <div className="relative w-full">
          <img src={photo} alt={label} className="w-full h-40 object-contain rounded-lg" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="text-center py-4">
          <div className="w-12 h-12 mx-auto bg-slate-200 rounded-full flex items-center justify-center mb-3">
            <Upload className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 font-medium">Drag & drop or click</p>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 2MB</p>
        </div>
      )}
    </div>
  );
}

function RecordCard({ record }: { record: TestRecord }) {
  const statusStyles: Record<string, string> = {
    'OK': 'bg-emerald-50 text-emerald-600 border-emerald-200',
    'Not OK': 'bg-red-50 text-red-600 border-red-200',
    'Under Analysis': 'bg-amber-50 text-amber-600 border-amber-200',
  };

  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">{record.barcode}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {record.station_id || 'No station'}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${statusStyles[record.inspection_status]}`}>
          {record.inspection_status}
        </span>
      </div>
      <p className="text-xs text-slate-500 truncate">
        {record.operator_name || 'Unknown'} · {format(new Date(record.inspection_date), 'MMM d, yyyy')}
      </p>
      {record.before_photo_url && (
        <div className="flex gap-1.5 mt-2">
          <img src={record.before_photo_url} alt="Before" className="w-12 h-12 object-cover rounded border border-slate-200" />
          {record.after_photo_url && (
            <img src={record.after_photo_url} alt="After" className="w-12 h-12 object-cover rounded border border-slate-200" />
          )}
        </div>
      )}
    </div>
  );
}
