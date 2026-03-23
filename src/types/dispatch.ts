export type DispatchStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface DispatchRequest {
  id: string;
  factory_id: string;
  reference_number: string; // DSP-YYYYMMDD-NNN
  work_order_id: string | null;
  style_name: string | null;
  buyer_name: string | null;
  dispatch_quantity: number;
  carton_count: number | null;
  truck_number: string;
  driver_name: string;
  driver_nid: string | null;
  destination: string;
  remarks: string | null;
  photo_url: string | null;
  status: DispatchStatus;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  gate_pass_pdf_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (present when fetched with select())
  submitter?: { full_name: string; id: string };
  reviewer?: { full_name: string; id: string };
  work_order?: { po_number: string; style: string | null; buyer: string | null; order_qty: number | null };
}

export interface UserSignature {
  id: string;
  user_id: string;
  factory_id: string;
  signature_url: string;
  registered_at: string;
  updated_at: string;
}

export interface DispatchDailySequence {
  factory_id: string;
  date: string; // YYYY-MM-DD
  last_sequence: number;
}

export interface DispatchFormData {
  work_order_id: string | null;
  style_name: string;
  buyer_name: string;
  dispatch_quantity: number | '';
  carton_count: number | '';
  truck_number: string;
  driver_name: string;
  driver_nid: string;
  destination: string;
  remarks: string;
  photo_file: File | null;
}
