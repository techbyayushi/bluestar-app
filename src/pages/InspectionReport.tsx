import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, TestRecord, InspectionStatus, CustomField } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Edit3,
  Loader2,
  Camera,
  Image,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
} from 'lucide-react';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'PPP p');
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, 'PPP');
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function PhotoDropZone({
  label,
  photo,
  onClick,
  onClear,
}: {
  label: string;
  photo: string | null;
  onClick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="relative border border-slate-200 rounded-xl p-4 bg-slate-50">
      <p className="text-xs text-slate-500 mb-3">{label}</p>
      {photo ? (
        <div className="relative">
          <img src={photo} alt={label} className="w-full h-52 object-contain rounded-lg" />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-600 shadow-sm hover:text-red-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="w-full h-52 border border-dashed border-slate-300 rounded-xl bg-white flex flex-col items-center justify-center gap-3 text-slate-500"
        >
          <Image className="w-6 h-6" />
          <span className="text-sm">Click to upload</span>
        </button>
      )}
    </div>
  );
}

export function InspectionReport({ editMode }: { editMode?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, logAudit } = useAuth();
  const [record, setRecord] = useState<TestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string>('');

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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchRecord = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('test_records').select('*').eq('id', id).single();
        if (error) {
          setError('Failed to load inspection record.');
          console.error('Inspection fetch error:', error);
          return;
        }
        if (!data) {
          setError('Inspection record not found.');
          return;
        }
        setRecord(data as TestRecord);
      } catch (err) {
        setError('Failed to load inspection record.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecord();
  }, [id]);

  useEffect(() => {
    if (!record) return;
    setFormData({
      barcode: record.barcode || '',
      station_id: record.station_id || '',
      operator_name: record.operator_name || user?.full_name || '',
      inspection_date: record.inspection_date ? format(new Date(record.inspection_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      expected_result: record.expected_result || '',
      actual_result: record.actual_result || '',
      inspection_status: record.inspection_status || 'Under Analysis',
      failure_type: record.failure_type || 'Line Failure Analysis',
      inspection_remarks: record.inspection_remarks || '',
    });
    setBeforePhoto(record.before_photo_url || null);
    setAfterPhoto(record.after_photo_url || null);
    setCustomFields(record.custom_fields || []);
  }, [record, user?.full_name]);

  const handleUpdate = async () => {
    if (!record || !id) return;
    if (!formData.barcode.trim() || !formData.station_id.trim() || !formData.operator_name.trim()) {
      setError('Please fill in Serial, Station, and Inspector name.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const payload = {
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
      };

      const { data, error } = await supabase.from('test_records').update(payload).eq('id', id).select().single();
      if (error) throw error;
      setRecord(data as TestRecord);
      setSuccessMsg('Inspection report updated successfully.');
      await logAudit('TEST_RECORD_UPDATED', 'test_records', id, { barcode: formData.barcode, inspection_status: formData.inspection_status });
      setTimeout(() => setSuccessMsg(''), 4000);
      navigate(`/inspection/${id}`);
    } catch (err) {
      console.error('Update error:', err);
      setError('Failed to update inspection report.');
    } finally {
      setSaving(false);
    }
  };

  const handleImageClick = (url: string | null) => {
    if (!url) return;
    setSelectedImage(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
          <p className="font-semibold">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center text-slate-500 py-20">Inspection record not found.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Inspection Report</p>
          <h1 className="text-2xl font-semibold text-slate-900">{record.barcode}</h1>
          <p className="text-sm text-slate-400 mt-1">{record.station_id || 'Station unavailable'}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Back
          </button>
          {!editMode && (
            <button
              type="button"
              onClick={() => navigate(`/inspection/${id}/edit`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
            >
              <Edit3 className="w-4 h-4" /> Edit
            </button>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700">
          {successMsg}
        </div>
      )}

      {editMode ? (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Serial Number">
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
              <FormField label="Station">
                <input
                  type="text"
                  value={formData.station_id}
                  onChange={e => setFormData({ ...formData, station_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
              <FormField label="Inspector Name">
                <input
                  type="text"
                  value={formData.operator_name}
                  onChange={e => setFormData({ ...formData, operator_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
              <FormField label="Date">
                <input
                  type="date"
                  value={formData.inspection_date}
                  onChange={e => setFormData({ ...formData, inspection_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
              <FormField label="Status">
                <select
                  value={formData.inspection_status}
                  onChange={e => setFormData({ ...formData, inspection_status: e.target.value as InspectionStatus })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                >
                  <option value="Under Analysis">Under Analysis</option>
                  <option value="OK">OK</option>
                  <option value="Not OK">Not OK</option>
                </select>
              </FormField>
              <FormField label="Failure Type">
                <select
                  value={formData.failure_type}
                  onChange={e => setFormData({ ...formData, failure_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                >
                  <option value="Line Failure Analysis">Line Failure Analysis</option>
                  <option value="Field Failure Analysis">Field Failure Analysis</option>
                </select>
              </FormField>
              <FormField label="Expected Result">
                <input
                  type="text"
                  value={formData.expected_result}
                  onChange={e => setFormData({ ...formData, expected_result: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
              <FormField label="Actual Result">
                <input
                  type="text"
                  value={formData.actual_result}
                  onChange={e => setFormData({ ...formData, actual_result: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
              <FormField label="Remarks">
                <textarea
                  value={formData.inspection_remarks}
                  onChange={e => setFormData({ ...formData, inspection_remarks: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                />
              </FormField>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PhotoDropZone
              label="Before Photo"
              photo={beforePhoto}
              onClick={() => setBeforePhoto(record.before_photo_url || null)}
              onClear={() => setBeforePhoto(null)}
            />
            <PhotoDropZone
              label="After Photo"
              photo={afterPhoto}
              onClick={() => setAfterPhoto(record.after_photo_url || null)}
              onClear={() => setAfterPhoto(null)}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Custom Fields</h2>
              <button
                type="button"
                className="text-accent-600 hover:text-accent-700 text-sm"
                onClick={() => setCustomFields([...customFields, { id: `field-${Date.now()}`, label: '', type: 'text', value: '' }])}
              >
                Add field
              </button>
            </div>
            {customFields.length === 0 ? (
              <div className="text-sm text-slate-500">No custom fields available.</div>
            ) : (
              <div className="space-y-3">
                {customFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-[1fr_120px_40px] gap-3 items-center">
                    <input
                      type="text"
                      value={field.label}
                      onChange={e => setCustomFields(customFields.map((f, i) => i === index ? { ...f, label: e.target.value } : f))}
                      placeholder="Field label"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    />
                    {field.type === 'text' ? (
                      <input
                        type="text"
                        value={String(field.value)}
                        onChange={e => setCustomFields(customFields.map((f, i) => i === index ? { ...f, value: e.target.value } : f))}
                        placeholder="Value"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                      />
                    ) : (
                      <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <input
                          type="checkbox"
                          checked={Boolean(field.value)}
                          onChange={e => setCustomFields(customFields.map((f, i) => i === index ? { ...f, value: e.target.checked } : f))}
                        />
                        Checked
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomFields(customFields.filter((_, i) => i !== index))}
                      className="text-red-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={() => navigate(`/inspection/${id}`)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpdate}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Serial Number" value={record.barcode} />
                <DetailRow label="Station" value={record.station_id || '-'} />
                <DetailRow label="Inspector" value={record.operator_name || '-'} />
                <DetailRow label="Inspection Date" value={formatDateTime(record.inspection_date)} />
                <DetailRow label="Overall Status" value={record.inspection_status} />
                <DetailRow label="Created At" value={formatDateTime(record.created_at)} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Inspection Details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow label="Failure Type" value={record.failure_type || '-'} />
                <DetailRow label="Expected Result" value={record.expected_result || '-'} />
                <DetailRow label="Actual Result" value={record.actual_result || '-'} />
                <DetailRow label="Remarks" value={record.inspection_remarks || '-'} />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Sensor / ATE Data</h2>
              {record.ate_data && Object.keys(record.ate_data).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(record.ate_data).map(([key, value]) => (
                    <DetailRow key={key} label={key} value={String(value ?? '-')} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No sensor readings available.</p>
              )}
            </div>

            {record.custom_fields && record.custom_fields.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Custom Fields</h2>
                <div className="space-y-3">
                  {record.custom_fields.map(field => (
                    <DetailRow key={field.id} label={field.label || 'Field'} value={String(field.value ?? '-')} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Photos</h2>
              <div className="grid grid-cols-1 gap-4">
                {record.before_photo_url && (
                  <button type="button" onClick={() => handleImageClick(record.before_photo_url)} className="border border-slate-200 rounded-xl overflow-hidden">
                    <img src={record.before_photo_url} alt="Before Inspection" className="w-full h-40 object-cover" />
                    <div className="p-3 text-left">
                      <p className="text-sm font-medium text-slate-700">Before Inspection</p>
                    </div>
                  </button>
                )}
                {record.after_photo_url && (
                  <button type="button" onClick={() => handleImageClick(record.after_photo_url)} className="border border-slate-200 rounded-xl overflow-hidden">
                    <img src={record.after_photo_url} alt="After Inspection" className="w-full h-40 object-cover" />
                    <div className="p-3 text-left">
                      <p className="text-sm font-medium text-slate-700">After Inspection</p>
                    </div>
                  </button>
                )}
                {!record.before_photo_url && !record.after_photo_url && (
                  <p className="text-sm text-slate-500">No inspection images available.</p>
                )}
              </div>
            </div>

            {selectedImage && (
              <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                <div className="relative max-w-4xl w-full rounded-2xl overflow-hidden bg-white shadow-2xl">
                  <button
                    type="button"
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white text-slate-700 flex items-center justify-center shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <img src={selectedImage} alt="Inspection" className="w-full max-h-[80vh] object-contain bg-slate-900" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-[0.16em] mb-2">{label}</p>
      <p className="text-sm text-slate-700">{value}</p>
    </div>
  );
}
