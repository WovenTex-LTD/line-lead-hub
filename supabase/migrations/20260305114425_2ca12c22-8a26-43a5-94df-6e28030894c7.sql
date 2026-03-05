
-- Form Builder Tables

create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  factory_id uuid references factory_accounts(id) on delete cascade,
  form_type text not null,
  target_table text not null,
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(factory_id, form_type)
);

create table if not exists form_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references form_templates(id) on delete cascade not null,
  key text not null,
  title_key text not null,
  description text,
  sort_order int not null default 0,
  is_collapsible boolean default false,
  is_active boolean default true
);

create table if not exists form_fields (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references form_sections(id) on delete cascade not null,
  template_id uuid references form_templates(id) on delete cascade not null,
  key text not null,
  db_column text,
  label_key text not null,
  field_type text not null,
  is_required boolean default false,
  is_custom boolean default false,
  sort_order int not null default 0,
  is_active boolean default true,
  default_value text,
  placeholder text,
  validation jsonb,
  data_source jsonb,
  compute_expression text,
  auto_fill_from jsonb,
  visible_when jsonb
);

create table if not exists form_role_overrides (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references form_templates(id) on delete cascade not null,
  role text not null,
  hidden_field_ids uuid[] default '{}',
  hidden_section_ids uuid[] default '{}',
  required_overrides jsonb default '{}',
  unique(template_id, role)
);

-- Add custom_data column to submission tables
alter table sewing_actuals add column if not exists custom_data jsonb default '{}';
alter table sewing_targets add column if not exists custom_data jsonb default '{}';
alter table finishing_actuals add column if not exists custom_data jsonb default '{}';
alter table finishing_targets add column if not exists custom_data jsonb default '{}';
alter table cutting_actuals add column if not exists custom_data jsonb default '{}';
alter table production_updates_sewing add column if not exists custom_data jsonb default '{}';

-- Add use_dynamic_forms flag
alter table factory_accounts add column if not exists use_dynamic_forms boolean default false;

-- Indexes
create index if not exists idx_form_templates_factory on form_templates(factory_id);
create index if not exists idx_form_templates_type on form_templates(form_type);
create index if not exists idx_form_sections_template on form_sections(template_id);
create index if not exists idx_form_fields_section on form_fields(section_id);
create index if not exists idx_form_fields_template on form_fields(template_id);
create index if not exists idx_form_role_overrides_template on form_role_overrides(template_id);

-- RLS
alter table form_templates enable row level security;
alter table form_sections enable row level security;
alter table form_fields enable row level security;
alter table form_role_overrides enable row level security;

-- Read policies (using existing helper functions to avoid recursion)
create policy "Users can read form templates for their factory"
  on form_templates for select to authenticated
  using (factory_id is null or factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()));

create policy "Users can read form sections"
  on form_sections for select to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_sections.template_id
    and (ft.factory_id is null or ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Users can read form fields"
  on form_fields for select to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_fields.template_id
    and (ft.factory_id is null or ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Users can read form role overrides"
  on form_role_overrides for select to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_role_overrides.template_id
    and (ft.factory_id is null or ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

-- Write policies (using existing helper functions)
create policy "Admins can insert form templates"
  on form_templates for insert to authenticated
  with check (is_admin_or_higher(auth.uid()) and (factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid())));

create policy "Admins can update form templates"
  on form_templates for update to authenticated
  using (is_admin_or_higher(auth.uid()) and (factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid())));

create policy "Admins can delete form templates"
  on form_templates for delete to authenticated
  using (is_admin_or_higher(auth.uid()) and (factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid())));

create policy "Admins can insert form sections"
  on form_sections for insert to authenticated
  with check (exists (
    select 1 from form_templates ft
    where ft.id = form_sections.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can update form sections"
  on form_sections for update to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_sections.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can delete form sections"
  on form_sections for delete to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_sections.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can insert form fields"
  on form_fields for insert to authenticated
  with check (exists (
    select 1 from form_templates ft
    where ft.id = form_fields.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can update form fields"
  on form_fields for update to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_fields.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can delete form fields"
  on form_fields for delete to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_fields.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can insert form role overrides"
  on form_role_overrides for insert to authenticated
  with check (exists (
    select 1 from form_templates ft
    where ft.id = form_role_overrides.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can update form role overrides"
  on form_role_overrides for update to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_role_overrides.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));

create policy "Admins can delete form role overrides"
  on form_role_overrides for delete to authenticated
  using (exists (
    select 1 from form_templates ft
    where ft.id = form_role_overrides.template_id
    and is_admin_or_higher(auth.uid())
    and (ft.factory_id = get_user_factory_id(auth.uid()) or is_superadmin(auth.uid()))
  ));
