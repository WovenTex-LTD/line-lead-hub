import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SalesContract {
  id: string;
  factory_id: string;
  contract_number: string;
  buyer_name: string;
  buyer_address: string | null;
  buyer_contact: string | null;
  contract_date: string;
  season: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  incoterms: string | null;
  port_of_loading: string | null;
  port_of_discharge: string | null;
  country_of_origin: string;
  currency: string;
  exchange_rate: number;
  lc_required: boolean;
  lc_number: string | null;
  lc_date: string | null;
  lc_expiry_date: string | null;
  total_quantity: number;
  total_value: number;
  commission_pct: number;
  agent_name: string | null;
  status: "draft" | "confirmed" | "in_production" | "shipped" | "completed" | "cancelled";
  notes: string | null;
  internal_notes: string | null;
  // Beneficiary bank
  beneficiary_bank_name: string | null;
  beneficiary_bank_branch: string | null;
  beneficiary_bank_swift: string | null;
  beneficiary_bank_account: string | null;
  beneficiary_bank_address: string | null;
  // Applicant
  applicant_name: string | null;
  applicant_address: string | null;
  applicant_bank_name: string | null;
  applicant_bank_address: string | null;
  applicant_bank_iban: string | null;
  applicant_bank_swift: string | null;
  applicant_bank_account: string | null;
  // Notify party
  notify_party_name: string | null;
  notify_party_address: string | null;
  notify_party_contact: string | null;
  notify_party_note: string | null;
  // Additional
  contract_title: string;
  end_customer: string | null;
  shipment_mode: string;
  expiry_date: string | null;
  tolerance_pct: number;
  documents_required: string | null;
  additional_clauses: string | null;
  commission_per_piece: number | null;
  agent_bank_name: string | null;
  agent_bank_address: string | null;
  agent_bank_account: string | null;
  agent_bank_iban: string | null;
  agent_bank_swift: string | null;
  total_value_text: string | null;
  place_of_delivery: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sales_contract_items?: ContractItem[];
  sales_contract_amendments?: ContractAmendment[];
  sales_contract_documents?: ContractDocument[];
}

export interface ContractItem {
  id: string;
  contract_id: string;
  work_order_id: string | null;
  po_number: string | null;
  style_ref: string;
  style_description: string | null;
  garment_type: string | null;
  fabric_composition: string | null;
  color: string | null;
  size_range: string | null;
  quantity: number;
  unit_price: number;
  price_type: string;
  delivery_date: string | null;
  ship_date: string | null;
  ex_factory_date: string | null;
  hs_code: string | null;
  remarks: string | null;
  sort_order: number;
  end_customer: string | null;
  subtotal_value: number | null;
}

export interface ContractAmendment {
  id: string;
  contract_id: string;
  amendment_number: number;
  amendment_date: string;
  description: string;
  changed_by: string | null;
  changes: any;
  created_at: string;
}

export interface ContractDocument {
  id: string;
  contract_id: string | null;
  factory_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  extracted_data: any;
  extraction_status: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface ExtractedPOData {
  buyer_name?: string;
  buyer_address?: string;
  po_number?: string;
  contract_number?: string;
  style_ref?: string;
  style_description?: string;
  garment_type?: string;
  fabric_composition?: string;
  colors?: string[];
  size_range?: string;
  quantity?: number;
  unit_price?: number;
  price_type?: string;
  currency?: string;
  delivery_date?: string;
  ship_date?: string;
  ex_factory_date?: string;
  payment_terms?: string;
  delivery_terms?: string;
  incoterms?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  country_of_origin?: string;
  lc_number?: string;
  special_instructions?: string;
  // Multiple items if PO has multiple styles
  items?: Array<{
    po_number?: string;
    style_ref?: string;
    style_description?: string;
    color?: string;
    size_range?: string;
    quantity?: number;
    unit_price?: number;
    delivery_date?: string;
  }>;
}

export type ContractItemInsert = Omit<ContractItem, "id" | "contract_id"> & { sort_order?: number };

// ── Helpers ─────────────────────────────────────────────────────────────────

async function generateContractNumber(factoryId: string): Promise<string> {
  const year = new Date().getFullYear();
  const pfx = `SC-${year}-`;
  const { data } = await supabase
    .from("sales_contracts" as any)
    .select("contract_number")
    .eq("factory_id", factoryId)
    .ilike("contract_number", `${pfx}%`)
    .order("contract_number", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    const seq = parseInt((data[0] as any).contract_number.replace(pfx, ""), 10);
    return `${pfx}${String(seq + 1).padStart(3, "0")}`;
  }
  return `${pfx}001`;
}

// ── List ────────────────────────────────────────────────────────────────────

export function useSalesContracts() {
  const { factory } = useAuth();
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!factory?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_contracts" as any)
      .select("*, sales_contract_items(count)")
      .eq("factory_id", factory.id)
      .order("contract_date", { ascending: false });

    if (error) toast.error("Failed to load contracts", { description: error.message });
    else setContracts((data as unknown as SalesContract[]) ?? []);
    setLoading(false);
  }, [factory?.id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { contracts, loading, refetch: fetch };
}

// ── Single contract ─────────────────────────────────────────────────────────

export function useSalesContract(id: string | undefined) {
  const [contract, setContract] = useState<SalesContract | null>(null);
  const [loading, setLoading] = useState(!!id);

  const fetch = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_contracts" as any)
      .select(
        "*, sales_contract_items(*), sales_contract_amendments(*), sales_contract_documents(*)"
      )
      .eq("id", id)
      .single();

    if (error) {
      toast.error("Failed to load contract", { description: error.message });
      setLoading(false);
      return;
    }

    const sc = data as unknown as SalesContract;
    if (sc.sales_contract_items) {
      sc.sales_contract_items = [...sc.sales_contract_items].sort(
        (a, b) => a.sort_order - b.sort_order
      );
    }
    if (sc.sales_contract_amendments) {
      sc.sales_contract_amendments = [...sc.sales_contract_amendments].sort(
        (a, b) => a.amendment_number - b.amendment_number
      );
    }
    setContract(sc);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);
  return { contract, loading, refetch: fetch };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useSalesContractMutations() {
  const { factory, profile } = useAuth();
  const [saving, setSaving] = useState(false);

  async function createContract(
    header: Omit<
      SalesContract,
      | "id"
      | "factory_id"
      | "contract_number"
      | "total_quantity"
      | "total_value"
      | "created_by"
      | "created_at"
      | "updated_at"
      | "sales_contract_items"
      | "sales_contract_amendments"
      | "sales_contract_documents"
    >,
    items: ContractItemInsert[]
  ): Promise<SalesContract | null> {
    if (!factory?.id) return null;
    setSaving(true);
    try {
      const contract_number = await generateContractNumber(factory.id);

      // Auto-calculate totals from items
      const total_quantity = items.reduce((sum, it) => sum + it.quantity, 0);
      const total_value = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

      const { data: sc, error: scErr } = await supabase
        .from("sales_contracts" as any)
        .insert({
          ...(header as any),
          factory_id: factory.id,
          contract_number,
          total_quantity,
          total_value,
          created_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (scErr) throw scErr;

      const contractId = (sc as any).id as string;

      if (items.length > 0) {
        const { error: itemErr } = await supabase
          .from("sales_contract_items" as any)
          .insert(
            items.map((it, i) => ({
              ...it,
              contract_id: contractId,
              sort_order: it.sort_order ?? i,
            }))
          );
        if (itemErr) throw itemErr;
      }

      toast.success(`Contract ${contract_number} created`);
      return sc as unknown as SalesContract;
    } catch (e: any) {
      toast.error("Failed to create contract", { description: e.message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateContract(
    id: string,
    header: Partial<
      Omit<
        SalesContract,
        | "id"
        | "factory_id"
        | "created_at"
        | "updated_at"
        | "sales_contract_items"
        | "sales_contract_amendments"
        | "sales_contract_documents"
      >
    >,
    items?: ContractItemInsert[]
  ): Promise<boolean> {
    setSaving(true);
    try {
      // If items provided, recalculate totals
      const updates: any = { ...header };
      if (items !== undefined) {
        updates.total_quantity = items.reduce((sum, it) => sum + it.quantity, 0);
        updates.total_value = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
      }

      const { error: scErr } = await supabase
        .from("sales_contracts" as any)
        .update(updates)
        .eq("id", id);
      if (scErr) throw scErr;

      if (items !== undefined) {
        await supabase.from("sales_contract_items" as any).delete().eq("contract_id", id);
        if (items.length > 0) {
          const { error: itemErr } = await supabase
            .from("sales_contract_items" as any)
            .insert(
              items.map((it, i) => ({
                ...it,
                contract_id: id,
                sort_order: it.sort_order ?? i,
              }))
            );
          if (itemErr) throw itemErr;
        }
      }

      toast.success("Contract updated");
      return true;
    } catch (e: any) {
      toast.error("Failed to update contract", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addAmendment(
    contractId: string,
    description: string,
    changes: any
  ): Promise<boolean> {
    setSaving(true);
    try {
      // Get next amendment number
      const { data: existing } = await supabase
        .from("sales_contract_amendments" as any)
        .select("amendment_number")
        .eq("contract_id", contractId)
        .order("amendment_number", { ascending: false })
        .limit(1);

      const nextNumber =
        existing && existing.length > 0
          ? (existing[0] as any).amendment_number + 1
          : 1;

      const { error } = await supabase
        .from("sales_contract_amendments" as any)
        .insert({
          contract_id: contractId,
          amendment_number: nextNumber,
          amendment_date: new Date().toISOString().split("T")[0],
          description,
          changed_by: profile?.id ?? null,
          changes,
        });
      if (error) throw error;

      toast.success(`Amendment #${nextNumber} added`);
      return true;
    } catch (e: any) {
      toast.error("Failed to add amendment", { description: e.message });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(
    id: string,
    status: SalesContract["status"]
  ): Promise<boolean> {
    const { error } = await supabase
      .from("sales_contracts" as any)
      .update({ status } as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update status");
      return false;
    }
    toast.success(`Marked as ${status}`);
    return true;
  }

  async function deleteContract(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("sales_contracts" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete contract");
      return false;
    }
    toast.success("Contract deleted");
    return true;
  }

  return {
    createContract,
    updateContract,
    addAmendment,
    updateStatus,
    deleteContract,
    saving,
  };
}

// ── PO Upload & Extraction ──────────────────────────────────────────────────

export function useExtractPO() {
  const { factory, profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedPOData | null>(null);

  function reset() {
    setExtractedData(null);
    setUploading(false);
  }

  async function uploadAndExtract(
    file: File
  ): Promise<{
    extractedData: ExtractedPOData | null;
    documentId: string | null;
    error: string | null;
  }> {
    if (!factory?.id) return { extractedData: null, documentId: null, error: "No factory" };
    setUploading(true);
    try {
      // 1. Upload file to storage
      const filePath = `${factory.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("contract-documents")
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("contract-documents")
        .getPublicUrl(filePath);
      const fileUrl = urlData.publicUrl;

      // 2. Create document record
      const { data: doc, error: docErr } = await supabase
        .from("sales_contract_documents" as any)
        .insert({
          factory_id: factory.id,
          file_name: file.name,
          file_url: fileUrl,
          file_type: file.type || null,
          extraction_status: "pending",
          uploaded_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (docErr) throw docErr;

      const documentId = (doc as any).id as string;

      // 3. Call edge function
      const { data: extractResult, error: fnErr } = await supabase.functions.invoke(
        "extract-po",
        { body: { fileUrl, documentId } }
      );
      if (fnErr) throw fnErr;

      const extracted = (extractResult as any)?.data as ExtractedPOData | null;

      // 4. Update document with extracted data
      await supabase
        .from("sales_contract_documents" as any)
        .update({
          extracted_data: extracted,
          extraction_status: extracted ? "completed" : "failed",
        } as any)
        .eq("id", documentId);

      setExtractedData(extracted);
      return { extractedData: extracted, documentId, error: null };
    } catch (e: any) {
      toast.error("Failed to extract PO data", { description: e.message });
      return { extractedData: null, documentId: null, error: e.message };
    } finally {
      setUploading(false);
    }
  }

  async function extractFromUrl(
    fileUrl: string
  ): Promise<{
    extractedData: ExtractedPOData | null;
    documentId: string | null;
    error: string | null;
  }> {
    if (!factory?.id) return { extractedData: null, documentId: null, error: "No factory" };
    setUploading(true);
    try {
      // 1. Create document record
      const fileName = fileUrl.split("/").pop() || "document";
      const { data: doc, error: docErr } = await supabase
        .from("sales_contract_documents" as any)
        .insert({
          factory_id: factory.id,
          file_name: fileName,
          file_url: fileUrl,
          file_type: null,
          extraction_status: "pending",
          uploaded_by: profile?.id ?? null,
        })
        .select()
        .single();
      if (docErr) throw docErr;

      const documentId = (doc as any).id as string;

      // 2. Call edge function
      const { data: extractResult, error: fnErr } = await supabase.functions.invoke(
        "extract-po",
        { body: { fileUrl, documentId } }
      );
      if (fnErr) throw fnErr;

      const extracted = (extractResult as any)?.data as ExtractedPOData | null;

      // 3. Update document with extracted data
      await supabase
        .from("sales_contract_documents" as any)
        .update({
          extracted_data: extracted,
          extraction_status: extracted ? "completed" : "failed",
        } as any)
        .eq("id", documentId);

      setExtractedData(extracted);
      return { extractedData: extracted, documentId, error: null };
    } catch (e: any) {
      toast.error("Failed to extract PO data", { description: e.message });
      return { extractedData: null, documentId: null, error: e.message };
    } finally {
      setUploading(false);
    }
  }

  return { uploading, extractedData, uploadAndExtract, extractFromUrl, reset };
}
