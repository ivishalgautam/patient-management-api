-- Baseline schema of the dental API as of 2026-10-07 (revamp M000).
-- Generated with pg_dump --schema-only from a production copy; the legacy
-- table dental_notes is excluded. Do not edit; add new migrations instead.

--

--
-- Name: enum_banners_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_banners_type AS ENUM (
    'video',
    'banner'
);

--
-- Name: enum_blocked_slots_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_blocked_slots_type AS ENUM (
    'date',
    'slot'
);

--
-- Name: enum_bookings_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_bookings_status AS ENUM (
    'pending',
    'canceled',
    'completed'
);

--
-- Name: enum_ledgers_entry_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ledgers_entry_type AS ENUM (
    'debit',
    'credit'
);

--
-- Name: enum_ledgers_reference_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_ledgers_reference_type AS ENUM (
    'treatment_payment',
    'treatment_plan',
    'expense',
    'refund',
    'adjustment'
);

--
-- Name: enum_patients_marital_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_patients_marital_status AS ENUM (
    'single',
    'married',
    ''
);

--
-- Name: enum_treatment_payments_payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_treatment_payments_payment_method AS ENUM (
    'upi',
    'cash',
    'other'
);

--
-- Name: enum_treatment_payments_payment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_treatment_payments_payment_type AS ENUM (
    'full',
    'installment',
    'advance'
);

--
-- Name: enum_treatment_plans_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_treatment_plans_status AS ENUM (
    'pending',
    'completed'
);

--
-- Name: enum_treatments_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_treatments_status AS ENUM (
    'active',
    'close'
);

--
-- Name: enum_users_gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_gender AS ENUM (
    'male',
    'female',
    'other',
    ''
);

--
-- Name: enum_users_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_role AS ENUM (
    'admin',
    'patient',
    'doctor',
    'staff'
);

--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id uuid NOT NULL,
    url character varying(255) NOT NULL,
    is_featured boolean DEFAULT false,
    type public.enum_banners_type NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: blocked_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_slots (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    type public.enum_blocked_slots_type NOT NULL,
    date date NOT NULL,
    slots character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    date date NOT NULL,
    slot time without time zone NOT NULL,
    status public.enum_bookings_status DEFAULT 'pending'::public.enum_bookings_status,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    notification_24hr_sent boolean DEFAULT false,
    notification_2hr_sent boolean DEFAULT false,
    notification_1hr_after_sent boolean DEFAULT false,
    review_message_sent boolean DEFAULT false
);

--
-- Name: clinic_patient_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_mappings (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: clinic_staff_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_mappings (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: clinics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinics (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    address character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    max_patients_per_slot integer DEFAULT 1
);

--
-- Name: comprehensive_examinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comprehensive_examinations (
    id uuid NOT NULL,
    chief_complaint text NOT NULL,
    medical_history text NOT NULL,
    dental_history text NOT NULL,
    examination text NOT NULL,
    gallery character varying(255)[] NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    patient_id uuid NOT NULL,
    affected_tooths jsonb NOT NULL
);

--
-- Name: doctor_patient_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_patient_mappings (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: doctor_service_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_service_mappings (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    service_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: doctors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    specialization character varying(255) DEFAULT ''::character varying,
    experience_years integer DEFAULT 0,
    about text DEFAULT ''::text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    documents text[] NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: investigations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.investigations (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    temperature character varying(255) NOT NULL,
    weight character varying(255) NOT NULL,
    blood_pressure character varying(255) DEFAULT ''::character varying,
    oxygen_saturation character varying(255) DEFAULT ''::character varying,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: ledgers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledgers (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    service_id uuid,
    reference_type public.enum_ledgers_reference_type NOT NULL,
    entry_type public.enum_ledgers_entry_type NOT NULL,
    amount integer NOT NULL,
    description character varying(255) DEFAULT ''::character varying,
    created_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid NOT NULL,
    notes text DEFAULT ''::text,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    patient_id uuid NOT NULL,
    affected_tooths character varying(255) NOT NULL
);

--
-- Name: patient_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient_sequences (
    id character varying(255) NOT NULL,
    value integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    blood_group character varying(255) DEFAULT ''::character varying,
    marital_status public.enum_patients_marital_status DEFAULT ''::public.enum_patients_marital_status,
    height_in_cm character varying(255) DEFAULT ''::character varying,
    emergency_contact character varying(255) DEFAULT ''::character varying,
    source character varying(255) DEFAULT ''::character varying,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: procedures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.procedures (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    is_featured boolean DEFAULT false,
    image text DEFAULT ''::text,
    meta_title text DEFAULT ''::text,
    meta_description text DEFAULT ''::text,
    meta_keywords text DEFAULT ''::text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid NOT NULL,
    procedure_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    image character varying(255) DEFAULT ''::character varying,
    slug character varying(255) NOT NULL,
    is_featured boolean DEFAULT false,
    main_points character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    custom_points jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slots (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    start_time character varying(255) NOT NULL,
    end_time character varying(255) NOT NULL,
    interval_in_minute integer NOT NULL,
    slots character varying(255)[] NOT NULL,
    days_off integer[] DEFAULT ARRAY[]::integer[],
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: staffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staffs (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: treatment_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_histories (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    content text DEFAULT ''::text,
    files text[] DEFAULT ARRAY[]::text[],
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: treatment_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_payments (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    payment_type public.enum_treatment_payments_payment_type NOT NULL,
    payment_method public.enum_treatment_payments_payment_method NOT NULL,
    amount_paid integer NOT NULL,
    remarks character varying(255) DEFAULT ''::character varying,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    advance_used integer DEFAULT 0
);

--
-- Name: treatment_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_plans (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    total_cost integer NOT NULL,
    notes jsonb DEFAULT '[]'::jsonb,
    radiographic_diagnosis character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    affected_tooths jsonb NOT NULL
);

--
-- Name: treatment_prescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_prescriptions (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    data jsonb NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: treatment_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatment_visits (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    visit_notes jsonb DEFAULT '0'::jsonb,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: treatments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.treatments (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    service_id uuid NOT NULL,
    appointment_id uuid,
    added_by uuid NOT NULL,
    status public.enum_treatments_status DEFAULT 'active'::public.enum_treatments_status,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    fullname character varying(255) NOT NULL,
    country_code character varying(255) NOT NULL,
    mobile_number character varying(255) NOT NULL,
    gender public.enum_users_gender DEFAULT ''::public.enum_users_gender,
    dob character varying(255),
    username character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    role public.enum_users_role NOT NULL,
    avatar character varying(255) DEFAULT ''::character varying,
    reset_password_token character varying(255),
    confirmation_token character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    email character varying(255) DEFAULT ''::character varying
);

--
-- Name: xrays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xrays (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    files text[] NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);

--
-- Name: blocked_slots blocked_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_slots
    ADD CONSTRAINT blocked_slots_pkey PRIMARY KEY (id);

--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

--
-- Name: clinic_patient_mappings clinic_patient_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_mappings
    ADD CONSTRAINT clinic_patient_mappings_pkey PRIMARY KEY (id);

--
-- Name: clinic_staff_mappings clinic_staff_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_mappings
    ADD CONSTRAINT clinic_staff_mappings_pkey PRIMARY KEY (id);

--
-- Name: clinics clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);

--
-- Name: comprehensive_examinations comprehensive_examinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprehensive_examinations
    ADD CONSTRAINT comprehensive_examinations_pkey PRIMARY KEY (id);

--
-- Name: doctor_patient_mappings doctor_patient_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_mappings
    ADD CONSTRAINT doctor_patient_mappings_pkey PRIMARY KEY (id);

--
-- Name: doctor_service_mappings doctor_service_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_service_mappings
    ADD CONSTRAINT doctor_service_mappings_pkey PRIMARY KEY (id);

--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);

--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

--
-- Name: investigations investigations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_pkey PRIMARY KEY (id);

--
-- Name: ledgers ledgers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_pkey PRIMARY KEY (id);

--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

--
-- Name: patient_sequences patient_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient_sequences
    ADD CONSTRAINT patient_sequences_pkey PRIMARY KEY (id);

--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);

--
-- Name: procedures procedures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_pkey PRIMARY KEY (id);

--
-- Name: procedures procedures_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_slug_key UNIQUE (slug);

--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

--
-- Name: services services_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_slug_key UNIQUE (slug);

--
-- Name: slots slots_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_clinic_id_key UNIQUE (clinic_id);

--
-- Name: slots slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_pkey PRIMARY KEY (id);

--
-- Name: staffs staffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffs
    ADD CONSTRAINT staffs_pkey PRIMARY KEY (id);

--
-- Name: treatment_histories treatment_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_histories
    ADD CONSTRAINT treatment_histories_pkey PRIMARY KEY (id);

--
-- Name: treatment_payments treatment_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_payments
    ADD CONSTRAINT treatment_payments_pkey PRIMARY KEY (id);

--
-- Name: treatment_plans treatment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_pkey PRIMARY KEY (id);

--
-- Name: treatment_prescriptions treatment_prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_prescriptions
    ADD CONSTRAINT treatment_prescriptions_pkey PRIMARY KEY (id);

--
-- Name: treatment_visits treatment_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_visits
    ADD CONSTRAINT treatment_visits_pkey PRIMARY KEY (id);

--
-- Name: treatments treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_pkey PRIMARY KEY (id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

--
-- Name: xrays xrays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xrays
    ADD CONSTRAINT xrays_pkey PRIMARY KEY (id);

--
-- Name: ledgers_clinic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledgers_clinic_id ON public.ledgers USING btree (clinic_id);

--
-- Name: ledgers_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ledgers_patient_id ON public.ledgers USING btree (patient_id);

--
-- Name: treatment_visits_added_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treatment_visits_added_by ON public.treatment_visits USING btree (added_by);

--
-- Name: treatment_visits_treatment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX treatment_visits_treatment_id ON public.treatment_visits USING btree (treatment_id);

--
-- Name: blocked_slots blocked_slots_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_slots
    ADD CONSTRAINT blocked_slots_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: bookings bookings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: bookings bookings_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: bookings bookings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: clinic_patient_mappings clinic_patient_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_mappings
    ADD CONSTRAINT clinic_patient_mappings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: clinic_patient_mappings clinic_patient_mappings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_mappings
    ADD CONSTRAINT clinic_patient_mappings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: clinic_staff_mappings clinic_staff_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_mappings
    ADD CONSTRAINT clinic_staff_mappings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: clinic_staff_mappings clinic_staff_mappings_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_mappings
    ADD CONSTRAINT clinic_staff_mappings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: clinics clinics_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: comprehensive_examinations comprehensive_examinations_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprehensive_examinations
    ADD CONSTRAINT comprehensive_examinations_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: comprehensive_examinations comprehensive_examinations_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprehensive_examinations
    ADD CONSTRAINT comprehensive_examinations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: doctor_patient_mappings doctor_patient_mappings_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_mappings
    ADD CONSTRAINT doctor_patient_mappings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: doctor_patient_mappings doctor_patient_mappings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_patient_mappings
    ADD CONSTRAINT doctor_patient_mappings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: doctor_service_mappings doctor_service_mappings_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_service_mappings
    ADD CONSTRAINT doctor_service_mappings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: doctor_service_mappings doctor_service_mappings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_service_mappings
    ADD CONSTRAINT doctor_service_mappings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: doctors doctors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: documents documents_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: documents documents_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
-- Name: investigations investigations_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: investigations investigations_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
-- Name: ledgers ledgers_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: ledgers ledgers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) DEFERRABLE;

--
-- Name: ledgers ledgers_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: ledgers ledgers_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledgers
    ADD CONSTRAINT ledgers_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL DEFERRABLE;

--
-- Name: notes notes_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: notes notes_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
-- Name: patients patients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: services services_procedure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.procedures(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: slots slots_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: slots slots_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: staffs staffs_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffs
    ADD CONSTRAINT staffs_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: staffs staffs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staffs
    ADD CONSTRAINT staffs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_histories treatment_histories_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_histories
    ADD CONSTRAINT treatment_histories_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_histories treatment_histories_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_histories
    ADD CONSTRAINT treatment_histories_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_payments treatment_payments_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_payments
    ADD CONSTRAINT treatment_payments_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_payments treatment_payments_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_payments
    ADD CONSTRAINT treatment_payments_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_plans treatment_plans_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_plans treatment_plans_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_plans treatment_plans_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_prescriptions treatment_prescriptions_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_prescriptions
    ADD CONSTRAINT treatment_prescriptions_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_prescriptions treatment_prescriptions_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_prescriptions
    ADD CONSTRAINT treatment_prescriptions_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_visits treatment_visits_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_visits
    ADD CONSTRAINT treatment_visits_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatment_visits treatment_visits_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatment_visits
    ADD CONSTRAINT treatment_visits_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatments treatments_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatments treatments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.bookings(id) ON DELETE SET NULL DEFERRABLE;

--
-- Name: treatments treatments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatments treatments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: treatments treatments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: xrays xrays_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xrays
    ADD CONSTRAINT xrays_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;

--
-- Name: xrays xrays_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xrays
    ADD CONSTRAINT xrays_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;

--
