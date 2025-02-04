--
-- PostgreSQL database dump
--

-- Dumped from database version 16.1
-- Dumped by pg_dump version 16.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: enum_banners_type; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_banners_type AS ENUM (
    'video',
    'banner'
);


ALTER TYPE public.enum_banners_type OWNER TO drdipti;

--
-- Name: enum_blocked_slots_type; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_blocked_slots_type AS ENUM (
    'date',
    'slot'
);


ALTER TYPE public.enum_blocked_slots_type OWNER TO drdipti;

--
-- Name: enum_bookings_status; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_bookings_status AS ENUM (
    'pending',
    'canceled',
    'completed'
);


ALTER TYPE public.enum_bookings_status OWNER TO drdipti;

--
-- Name: enum_patients_marital_status; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_patients_marital_status AS ENUM (
    'single',
    'married',
    ''
);


ALTER TYPE public.enum_patients_marital_status OWNER TO drdipti;

--
-- Name: enum_procedures_type; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_procedures_type AS ENUM (
    'video',
    'banner'
);


ALTER TYPE public.enum_procedures_type OWNER TO drdipti;

--
-- Name: enum_treatment_payments_payment_method; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_treatment_payments_payment_method AS ENUM (
    'upi',
    'cash',
    'other'
);


ALTER TYPE public.enum_treatment_payments_payment_method OWNER TO drdipti;

--
-- Name: enum_treatment_payments_payment_type; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_treatment_payments_payment_type AS ENUM (
    'full',
    'installment'
);


ALTER TYPE public.enum_treatment_payments_payment_type OWNER TO drdipti;

--
-- Name: enum_treatment_plans_status; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_treatment_plans_status AS ENUM (
    'pending',
    'completed'
);


ALTER TYPE public.enum_treatment_plans_status OWNER TO drdipti;

--
-- Name: enum_users_gender; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_users_gender AS ENUM (
    'admin',
    'patient',
    'male',
    'female',
    'other'
);


ALTER TYPE public.enum_users_gender OWNER TO drdipti;

--
-- Name: enum_users_role; Type: TYPE; Schema: public; Owner: drdipti
--

CREATE TYPE public.enum_users_role AS ENUM (
    'admin',
    'patient',
    'doctor',
    'staff'
);


ALTER TYPE public.enum_users_role OWNER TO drdipti;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.appointments (
    id uuid NOT NULL,
    patient_id uuid NOT NULL,
    service_id uuid NOT NULL,
    date date NOT NULL,
    is_canceled boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    slot character varying(255) NOT NULL,
    clinic_id uuid NOT NULL
);


ALTER TABLE public.appointments OWNER TO drdipti;

--
-- Name: banners; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.banners (
    id uuid NOT NULL,
    url character varying(255) NOT NULL,
    is_featured boolean DEFAULT false,
    type public.enum_banners_type NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.banners OWNER TO drdipti;

--
-- Name: blocked_slots; Type: TABLE; Schema: public; Owner: drdipti
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


ALTER TABLE public.blocked_slots OWNER TO drdipti;

--
-- Name: bookings; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.bookings (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    service_id uuid NOT NULL,
    date date NOT NULL,
    slot time without time zone NOT NULL,
    status public.enum_bookings_status DEFAULT 'pending'::public.enum_bookings_status,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.bookings OWNER TO drdipti;

--
-- Name: clinic_patient_mappings; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.clinic_patient_mappings (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.clinic_patient_mappings OWNER TO drdipti;

--
-- Name: clinic_staff_mappings; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.clinic_staff_mappings (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.clinic_staff_mappings OWNER TO drdipti;

--
-- Name: clinics; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.clinics (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    address character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.clinics OWNER TO drdipti;

--
-- Name: comprehensive_examinations; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.comprehensive_examinations (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    chief_complaint text NOT NULL,
    medical_history text NOT NULL,
    dental_history text NOT NULL,
    examination text NOT NULL,
    treatment_advice character varying(255)[] NOT NULL,
    gallery character varying(255)[] NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    added_by uuid NOT NULL
);


ALTER TABLE public.comprehensive_examinations OWNER TO drdipti;

--
-- Name: dental_charts; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.dental_charts (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    affected_tooths character varying(255)[] NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.dental_charts OWNER TO drdipti;

--
-- Name: dental_notes; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.dental_notes (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    affected_tooth character varying(255) NOT NULL,
    total_cost integer NOT NULL,
    notes text DEFAULT ''::text,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.dental_notes OWNER TO drdipti;

--
-- Name: doctor_patient_mappings; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.doctor_patient_mappings (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.doctor_patient_mappings OWNER TO drdipti;

--
-- Name: doctor_service_mappings; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.doctor_service_mappings (
    id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    doctor_id uuid NOT NULL,
    service_id uuid NOT NULL
);


ALTER TABLE public.doctor_service_mappings OWNER TO drdipti;

--
-- Name: doctors; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.doctors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    specialization character varying(255) DEFAULT ''::character varying,
    experience_years integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    about text DEFAULT ''::text
);


ALTER TABLE public.doctors OWNER TO drdipti;

--
-- Name: investigations; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.investigations (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    temperature character varying(255) NOT NULL,
    weight character varying(255) NOT NULL,
    blood_pressure character varying(255) DEFAULT ''::character varying,
    oxygen_saturation character varying(255) DEFAULT ''::character varying,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.investigations OWNER TO drdipti;

--
-- Name: models; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.models (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.models OWNER TO drdipti;

--
-- Name: notes; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.notes (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    affected_tooth character varying(255) NOT NULL,
    total_cost integer NOT NULL,
    notes text DEFAULT ''::text,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.notes OWNER TO drdipti;

--
-- Name: patients; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.patients (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    blood_group character varying(255) DEFAULT ''::character varying,
    marital_status public.enum_patients_marital_status DEFAULT ''::public.enum_patients_marital_status,
    height_in_cm character varying(255) DEFAULT ''::character varying,
    emergency_contact character varying(255) DEFAULT ''::character varying,
    source character varying(255) DEFAULT ''::character varying
);


ALTER TABLE public.patients OWNER TO drdipti;

--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.prescriptions (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.prescriptions OWNER TO drdipti;

--
-- Name: procedures; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.procedures (
    id uuid NOT NULL,
    is_featured boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    image text DEFAULT ''::text,
    meta_title text DEFAULT ''::text,
    meta_description text DEFAULT ''::text,
    meta_keywords text DEFAULT ''::text
);


ALTER TABLE public.procedures OWNER TO drdipti;

--
-- Name: services; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.services (
    id uuid NOT NULL,
    procedure_id uuid NOT NULL,
    actual_price double precision DEFAULT '0'::double precision,
    discounted_price double precision NOT NULL,
    name character varying(255) NOT NULL,
    image character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    is_featured boolean DEFAULT false,
    main_points character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    custom_points jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.services OWNER TO drdipti;

--
-- Name: slots; Type: TABLE; Schema: public; Owner: drdipti
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


ALTER TABLE public.slots OWNER TO drdipti;

--
-- Name: staffs; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.staffs (
    id uuid NOT NULL,
    doctor_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.staffs OWNER TO drdipti;

--
-- Name: treatment_histories; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.treatment_histories (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    content text DEFAULT ''::text,
    files text[] DEFAULT ARRAY[]::text[],
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    added_by uuid NOT NULL
);


ALTER TABLE public.treatment_histories OWNER TO drdipti;

--
-- Name: treatment_payments; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.treatment_payments (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    payment_type public.enum_treatment_payments_payment_type NOT NULL,
    payment_method public.enum_treatment_payments_payment_method NOT NULL,
    amount_paid integer NOT NULL,
    remarks character varying(255) DEFAULT ''::character varying,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    added_by uuid NOT NULL
);


ALTER TABLE public.treatment_payments OWNER TO drdipti;

--
-- Name: treatment_plans; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.treatment_plans (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    total_cost integer NOT NULL,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    status public.enum_treatment_plans_status DEFAULT 'pending'::public.enum_treatment_plans_status,
    added_by uuid NOT NULL
);


ALTER TABLE public.treatment_plans OWNER TO drdipti;

--
-- Name: treatment_prescriptions; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.treatment_prescriptions (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    added_by uuid NOT NULL
);


ALTER TABLE public.treatment_prescriptions OWNER TO drdipti;

--
-- Name: treatments; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.treatments (
    id uuid NOT NULL,
    clinic_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    service_id uuid NOT NULL,
    appointment_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    cost integer NOT NULL
);


ALTER TABLE public.treatments OWNER TO drdipti;

--
-- Name: users; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    mobile_number character varying(255) NOT NULL,
    country_code character varying(255) NOT NULL,
    fullname character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    role public.enum_users_role NOT NULL,
    reset_password_token character varying(255),
    confirmation_token character varying(255),
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    dob date NOT NULL,
    gender public.enum_users_gender NOT NULL,
    avatar character varying(255) DEFAULT ''::character varying
);


ALTER TABLE public.users OWNER TO drdipti;

--
-- Name: xrays; Type: TABLE; Schema: public; Owner: drdipti
--

CREATE TABLE public.xrays (
    id uuid NOT NULL,
    treatment_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    image text NOT NULL,
    added_by uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE public.xrays OWNER TO drdipti;

--
-- Data for Name: appointments; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.appointments (id, patient_id, service_id, date, is_canceled, created_at, updated_at, slot, clinic_id) FROM stdin;
\.


--
-- Data for Name: banners; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.banners (id, url, is_featured, type, created_at, updated_at) FROM stdin;
71028673-6853-4691-a1d9-7c2a7d62f7e7	public/images/1734434372010_pexels-cedric-fauntleroy-4269362.jpg	f	banner	2024-12-17 16:49:38.676+05:30	2024-12-17 16:50:03.202+05:30
2c99c4c1-5cde-4500-9522-fd2bae5d60c0	public/images/1734434398274_pexels-fr3nks-305565.jpg	t	banner	2024-12-07 13:45:00.656+05:30	2024-12-17 16:50:04.269+05:30
9a98f2f2-597f-4cb1-b2b9-3a8dc12c530c	public/images/1734435058964_pexels-cedric-fauntleroy-4269693.jpg	f	banner	2024-12-17 17:01:03.113+05:30	2024-12-17 17:01:03.113+05:30
bdfe007e-0777-4b03-89dc-67a29b32f44a	public/images/1734435068302_pexels-shvetsa-3845810.jpg	f	banner	2024-12-17 17:01:11.689+05:30	2024-12-17 17:01:11.689+05:30
0be87d11-35a8-419b-960b-86f736eb1d72	public/images/1734435093428_pexels-shvetsa-3845806.jpg	t	banner	2024-12-17 17:01:38.547+05:30	2024-12-17 17:02:10.634+05:30
15cdf883-43ae-4d32-8298-e597b375164a	public/images/1734435082711_pexels-arda-kaykisiz-672105204-19976571.jpg	t	banner	2024-12-17 17:01:27.979+05:30	2024-12-17 17:02:12.209+05:30
af732c15-97a7-4cc2-a2a9-3556a4737568	public/videos/1734432632012_4490311-sd_426_240_25fps.mp4	f	video	2024-12-17 16:20:48.18+05:30	2024-12-17 17:02:39.841+05:30
\.


--
-- Data for Name: blocked_slots; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.blocked_slots (id, clinic_id, type, date, slots, created_at, updated_at) FROM stdin;
d179ea5b-d2ea-4dd0-80e7-53c38290ace6	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-18	{13:28:00,14:28:00}	2024-12-04 13:45:08.43+05:30	2024-12-04 13:45:08.43+05:30
e4395ec1-51e1-4771-8ba5-70dc2454eba3	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-27	{13:28:00,14:28:00}	2024-12-04 13:49:58.991+05:30	2024-12-04 13:49:58.991+05:30
1cda63c9-cead-4867-97fd-856fbea96d37	425cf02a-c3ca-41e5-b1ca-bf319c0da679	slot	2024-11-21	{08:23:00,09:13:00,13:23:00,14:13:00}	2024-11-20 13:46:33.904+05:30	2024-11-20 13:46:33.904+05:30
29c67f4c-7f05-43ea-9158-3fb924fd41e0	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-28	{13:28:00,14:28:00}	2024-12-04 13:50:26.015+05:30	2024-12-04 13:50:26.015+05:30
4e0e46de-7d54-4ede-a7f1-3e28e13d9049	425cf02a-c3ca-41e5-b1ca-bf319c0da672	slot	2025-01-18	{10:00:00,10:30:00}	2024-12-13 11:08:24.603+05:30	2024-12-13 11:08:24.603+05:30
443a4951-4637-420f-851c-b74a19998a28	425cf02a-c3ca-41e5-b1ca-bf319c0da679	date	2024-11-20	{08:23:00,09:13:00,10:03:00,10:53:00,11:43:00,12:33:00,13:23:00,14:13:00,15:03:00,15:53:00,16:43:00,17:33:00,18:23:00,19:13:00,20:03:00,20:53:00,21:43:00,22:33:00}	2024-11-20 17:22:18.799+05:30	2024-11-20 17:22:18.799+05:30
35e7b4de-3752-4b25-a508-4a0fdd1212bc	425cf02a-c3ca-41e5-b1ca-bf319c0da679	date	2024-11-22	{08:23:00,09:13:00,10:03:00,10:53:00,11:43:00,12:33:00,13:23:00,14:13:00,15:03:00,15:53:00,16:43:00,17:33:00,18:23:00,19:13:00,20:03:00,20:53:00,21:43:00,22:33:00}	2024-11-20 17:22:23.82+05:30	2024-11-20 17:22:23.82+05:30
536e2098-7eec-4222-a598-252e1a6c5620	425cf02a-c3ca-41e5-b1ca-bf319c0da679	date	2024-11-26	{08:23:00,09:13:00,10:03:00,10:53:00,11:43:00,12:33:00,13:23:00,14:13:00,15:03:00,15:53:00,16:43:00,17:33:00,18:23:00,19:13:00,20:03:00,20:53:00,21:43:00,22:33:00}	2024-11-20 17:22:33.659+05:30	2024-11-20 17:22:33.659+05:30
8795627d-f969-40d5-9617-87b51f1421bf	425cf02a-c3ca-41e5-b1ca-bf319c0da672	slot	2024-12-19	{10:00:00}	2024-12-16 17:21:15.874+05:30	2024-12-16 17:21:15.874+05:30
08bf748b-fb0a-4fdb-8969-6dd62d164c4c	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-25	{13:28:00,14:28:00}	2024-12-07 12:43:56.658+05:30	2024-12-07 12:43:56.658+05:30
7e6513c9-de67-48b6-8aa0-4e4e5c72406f	425cf02a-c3ca-41e5-b1ca-bf319c0da672	slot	2024-12-13	{12:30:00,13:00:00,13:30:00}	2024-12-07 13:49:18.422+05:30	2024-12-07 13:49:18.422+05:30
53f30657-9ee9-4f02-b9e7-8cd8d527f5c0	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-31	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-07 13:49:36.724+05:30	2024-12-07 13:49:36.724+05:30
c26d8c2d-6edd-4939-8b52-967b94a0d3b4	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-21	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-07 13:50:12.201+05:30	2024-12-07 13:50:12.201+05:30
67c1b717-5c04-4652-9c35-da0beea9caf9	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-14	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-07 13:50:42.5+05:30	2024-12-07 13:50:42.5+05:30
9f3e4bf0-da81-43cd-bbb1-a5b550eb5cf2	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-01-01	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-12 12:47:07.993+05:30	2024-12-12 12:47:07.993+05:30
4749f4fc-6363-45ec-9d3b-b3be121f7faf	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-01-03	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-12 12:47:27.186+05:30	2024-12-12 12:47:27.186+05:30
ccbf1bf3-d537-4ff5-8db5-992ac2ea9ebe	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-02-06	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-12 12:47:53.182+05:30	2024-12-12 12:47:53.182+05:30
29fc76be-54a9-4375-9808-f3882e49ea88	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-02-07	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-12 12:48:01.485+05:30	2024-12-12 12:48:01.485+05:30
a1ec6c89-4dce-4bbd-8397-fc6e89597869	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-26	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-12 16:40:11.316+05:30	2024-12-12 16:40:11.316+05:30
a21343b3-54be-4c90-8217-21b76b2314da	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2024-12-20	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-07 13:50:50.146+05:30	2024-12-12 16:46:52.282+05:30
379ba189-4db8-4511-855e-1565ecc458cf	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-01-02	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-12 16:48:10.737+05:30	2024-12-12 16:48:10.737+05:30
e0e7f799-3fc5-47de-990b-d825d80e0646	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-01-25	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-13 11:05:54.353+05:30	2024-12-13 11:05:54.353+05:30
75d86c2e-48c2-4d34-87cc-70aae446ead1	425cf02a-c3ca-41e5-b1ca-bf319c0da672	date	2025-01-04	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	2024-12-13 11:06:37.727+05:30	2024-12-13 11:06:37.727+05:30
\.


--
-- Data for Name: bookings; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.bookings (id, doctor_id, patient_id, clinic_id, service_id, date, slot, status, created_at, updated_at) FROM stdin;
06b414ef-50e6-44ce-bab4-f080f295297c	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-18	11:00:00	completed	2024-12-13 18:19:28.677+05:30	2024-12-14 16:02:17.735+05:30
245ad6a8-21b1-44d2-b4c6-c3a567651a18	425cf02a-c3ca-41e5-b1ca-bf319c0da683	915bf1e4-bb64-4738-9784-3d2cf53768a4	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2024-12-13	15:00:00	completed	2024-12-12 13:11:29.254+05:30	2024-12-14 16:24:35.787+05:30
1fd4bcad-f96c-4e08-b15f-8a196cb04854	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-18	11:30:00	canceled	2024-12-16 11:04:13.502+05:30	2024-12-17 11:18:00.895+05:30
920d3474-629e-400f-a954-6074139154a6	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-18	11:00:00	canceled	2024-12-16 10:34:44.852+05:30	2024-12-17 12:02:22.978+05:30
252d7d1a-9997-472a-bbdf-6b5b168283d9	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-12-06	10:00:00	canceled	2024-12-17 12:12:58.694+05:30	2024-12-18 10:59:52.707+05:30
a2f17ae2-3a21-4250-8d30-31b36097fcc8	425cf02a-c3ca-41e5-b1ca-bf319c0da683	b98b430c-ad77-4f90-b471-8ab4752a8369	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2024-12-20	13:28:00	canceled	2024-12-07 13:25:18.661+05:30	2024-12-12 13:05:38.243+05:30
91d655c7-d04b-4e59-bc96-6229b15c7e11	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	3a5cbb78-7951-4a46-9c83-911565335501	2024-12-19	10:30:00	canceled	2024-12-18 11:02:52.337+05:30	2024-12-18 11:03:12.426+05:30
c67d28f2-d00c-4851-9a80-1341d37fb7b9	425cf02a-c3ca-41e5-b1ca-bf319c0da683	b98b430c-ad77-4f90-b471-8ab4752a8369	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2024-12-20	14:28:00	completed	2024-12-07 13:28:03.026+05:30	2024-12-12 13:05:42.838+05:30
e91166a0-13f2-451f-9a57-064889a445e1	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2024-11-25	06:09:00	completed	2024-12-03 13:42:31.614+05:30	2024-12-12 13:12:54.418+05:30
9c68fa32-bba1-4bbd-aa80-a40b470e2d84	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-24	10:00:00	completed	2024-12-19 13:13:11.408+05:30	2025-01-21 13:22:15.185+05:30
04222245-616a-47a0-bcac-d9550e99ef33	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-17	10:00:00	completed	2024-12-19 13:12:47.517+05:30	2025-01-21 13:28:02.409+05:30
0c4f4add-6835-47de-963e-6c0f4e4ad4c8	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-30	11:30:00	completed	2024-12-18 14:57:05.56+05:30	2025-01-21 13:38:17.246+05:30
12664724-6434-4174-a63b-93d5edea7949	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	3a5cbb78-7951-4a46-9c83-911565335501	2025-01-07	10:00:00	completed	2024-12-18 11:01:49.938+05:30	2025-01-21 13:38:44.75+05:30
4172dcf4-378d-483f-9f18-2e85d6312de7	425cf02a-c3ca-41e5-b1ca-bf319c0da683	67438927-06a4-4604-9d8c-dc2c48e3f92e	425cf02a-c3ca-41e5-b1ca-bf319c0da672	346fc7c1-ce06-4aae-a2f7-51a75607c180	2025-01-17	10:00:00	canceled	2024-12-14 15:27:52.273+05:30	2024-12-14 15:37:47.743+05:30
035f3046-40ed-4ac7-8f73-3e0cc49ff6b2	425cf02a-c3ca-41e5-b1ca-bf319c0da683	67438927-06a4-4604-9d8c-dc2c48e3f92e	425cf02a-c3ca-41e5-b1ca-bf319c0da672	3a5cbb78-7951-4a46-9c83-911565335501	2025-01-17	10:30:00	canceled	2024-12-14 15:29:27.696+05:30	2024-12-14 15:40:02.893+05:30
eac5c124-d5c6-4188-86b8-9d646411ecb1	425cf02a-c3ca-41e5-b1ca-bf319c0da683	36928d37-9531-418d-9e7b-9f3e1e823559	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-17	10:00:00	canceled	2024-12-14 11:07:48.07+05:30	2024-12-14 15:42:41.643+05:30
1be3733b-26c2-4d25-9da6-507196e399ac	425cf02a-c3ca-41e5-b1ca-bf319c0da683	915bf1e4-bb64-4738-9784-3d2cf53768a4	425cf02a-c3ca-41e5-b1ca-bf319c0da672	3a5cbb78-7951-4a46-9c83-911565335501	2025-01-22	10:30:00	completed	2025-01-21 13:41:32.957+05:30	2025-01-21 13:43:55.143+05:30
a7416ec1-7608-426b-97fa-9825be6dee28	425cf02a-c3ca-41e5-b1ca-bf319c0da683	915bf1e4-bb64-4738-9784-3d2cf53768a4	425cf02a-c3ca-41e5-b1ca-bf319c0da672	3a5cbb78-7951-4a46-9c83-911565335501	2025-01-22	10:00:00	completed	2025-01-21 13:41:22.642+05:30	2025-01-21 13:44:10.568+05:30
13a4a5dd-3679-4ed9-86e4-b246a07a8f84	425cf02a-c3ca-41e5-b1ca-bf319c0da683	67438927-06a4-4604-9d8c-dc2c48e3f92e	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-18	12:30:00	completed	2024-12-14 10:56:12.86+05:30	2024-12-14 15:57:47.109+05:30
1a0e6e6c-804d-4ff0-9945-1da8668b37bc	425cf02a-c3ca-41e5-b1ca-bf319c0da683	915bf1e4-bb64-4738-9784-3d2cf53768a4	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-18	12:00:00	canceled	2024-12-14 10:37:46.683+05:30	2024-12-14 16:00:24.716+05:30
2d3edcc4-f01e-4111-b72e-18a764400f81	425cf02a-c3ca-41e5-b1ca-bf319c0da683	4aea62f3-4268-4db9-bd6d-06539a81693d	425cf02a-c3ca-41e5-b1ca-bf319c0da672	c46ab3e2-6ef4-48ec-8d70-c59254fb689c	2025-01-18	11:30:00	completed	2024-12-13 18:21:43.759+05:30	2024-12-14 16:00:29.375+05:30
\.


--
-- Data for Name: clinic_patient_mappings; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.clinic_patient_mappings (id, clinic_id, patient_id, created_at, updated_at) FROM stdin;
d8302edd-da72-4d65-a090-c61b3de43a64	425cf02a-c3ca-41e5-b1ca-bf319c0da672	915bf1e4-bb64-4738-9784-3d2cf53768a4	2025-01-21 13:43:55.159+05:30	2025-01-21 13:43:55.159+05:30
\.


--
-- Data for Name: clinic_staff_mappings; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.clinic_staff_mappings (id, clinic_id, staff_id, created_at, updated_at) FROM stdin;
283cd5c5-84ef-48e8-8676-f83a2126a972	425cf02a-c3ca-41e5-b1ca-bf319c0da672	7888b070-f41d-49a4-9389-358574ce1d21	2024-12-11 16:40:58.199+05:30	2024-12-11 16:40:58.199+05:30
\.


--
-- Data for Name: clinics; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.clinics (id, doctor_id, name, address, created_at, updated_at) FROM stdin;
425cf02a-c3ca-41e5-b1ca-bf319c0da672	425cf02a-c3ca-41e5-b1ca-bf319c0da683	Dr Dipti Smile Suite	faridabad	2024-11-16 17:44:22.163668+05:30	2024-11-16 17:44:22.163668+05:30
425cf02a-c3ca-41e5-b1ca-bf319c0da679	425cf02a-c3ca-41e5-b1ca-bf319c0da683	Dr Dipti Smile Suite 1	delhi	2024-11-16 17:47:14.76182+05:30	2024-11-16 17:47:14.76182+05:30
d2d97ec5-8398-409f-8b0c-cf8a93d69d4b	bfd57547-80b2-4e97-adc2-c4fa5c281f99	Hedley Maddox	Accusantium blanditi	2024-11-30 11:37:06.498+05:30	2024-11-30 11:46:04.258+05:30
23a5803e-021a-4395-b279-fd95a5291007	bfd57547-80b2-4e97-adc2-c4fa5c281f99	Diana Walters	Odio in incidunt a 	2024-11-30 11:30:12.387+05:30	2024-11-30 11:46:44.325+05:30
\.


--
-- Data for Name: comprehensive_examinations; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.comprehensive_examinations (id, treatment_id, chief_complaint, medical_history, dental_history, examination, treatment_advice, gallery, created_at, updated_at, added_by) FROM stdin;
22c99df9-4a19-43e7-8841-4a4270365708	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	Incidunt expedita p	Corrupti totam duis	Placeat libero quo 	Mollitia iusto et pr	{OPG,CBCT}	{public/images/1737781427322_the_scottish_assam_india_limited_unlisted_shares-logo-1702187912.jpeg,public/images/1737781427326_aitmc_ventures_pvt._ltd._avpl_unlisted_shares_price-logo-1715845744.png,public/images/1737781427330_indian_potash_limited_unlisted_share-logo-1702178507.png,public/images/1737781427334_img_20220805_082354_924.jpg}	2025-01-25 10:33:52.654+05:30	2025-01-25 10:33:52.654+05:30	3447f8da-4915-4077-83ec-615fc369a558
\.


--
-- Data for Name: dental_charts; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.dental_charts (id, treatment_id, affected_tooths, added_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dental_notes; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.dental_notes (id, treatment_id, affected_tooth, total_cost, notes, added_by, created_at, updated_at) FROM stdin;
f0a13f39-cbfc-45fb-afa7-f4dd12a7a1ab	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	15	1200	qwfewqfew	3447f8da-4915-4077-83ec-615fc369a558	2025-01-23 13:11:21.59+05:30	2025-01-23 13:11:21.59+05:30
650c1d4a-0844-428c-9fe1-b08f706ef998	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	15	23	wegfweg	3447f8da-4915-4077-83ec-615fc369a558	2025-01-23 13:13:21.184+05:30	2025-01-23 13:13:21.184+05:30
17414081-b8e9-47a4-bdb1-7b3eae17e1dd	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	12	1200	dfsd	3447f8da-4915-4077-83ec-615fc369a558	2025-01-25 11:19:43.55+05:30	2025-01-25 11:54:13.898+05:30
\.


--
-- Data for Name: doctor_patient_mappings; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.doctor_patient_mappings (id, doctor_id, patient_id, created_at, updated_at) FROM stdin;
c48d49fb-c7f0-4c5c-aeb1-51ffd917d610	bfd57547-80b2-4e97-adc2-c4fa5c281f99	fcd37244-29fa-40d4-9256-2eb2ec71bee1	2024-11-29 17:19:00.172+05:30	2024-11-29 17:19:00.172+05:30
054f3477-914a-405d-913b-c293f79dac6c	425cf02a-c3ca-41e5-b1ca-bf319c0da683	b98b430c-ad77-4f90-b471-8ab4752a8369	2024-12-04 10:45:08.072+05:30	2024-12-04 10:45:08.072+05:30
8f2a5c64-53b9-4569-a327-3fdeba5466ad	425cf02a-c3ca-41e5-b1ca-bf319c0da683	36928d37-9531-418d-9e7b-9f3e1e823559	2024-12-04 12:25:01.325+05:30	2024-12-04 12:25:01.325+05:30
80cceb8f-5ebc-42ab-82da-287979437534	425cf02a-c3ca-41e5-b1ca-bf319c0da683	9f019bef-5a33-4f48-b5a5-5e98dcf79a29	2024-12-07 13:41:17.821+05:30	2024-12-07 13:41:17.821+05:30
fbf18d0f-dff1-4eef-9b00-e63530dbb669	425cf02a-c3ca-41e5-b1ca-bf319c0da683	83c655cc-9e6c-485e-81ca-a791f76419f5	2024-12-09 11:31:23.17+05:30	2024-12-09 11:31:23.17+05:30
\.


--
-- Data for Name: doctor_service_mappings; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.doctor_service_mappings (id, created_at, updated_at, doctor_id, service_id) FROM stdin;
fb3e9114-7d45-4caa-8265-71bc77dcf6a2	2024-12-03 10:36:09.71+05:30	2024-12-03 10:36:09.71+05:30	425cf02a-c3ca-41e5-b1ca-bf319c0da683	c46ab3e2-6ef4-48ec-8d70-c59254fb689c
374f147f-742c-437b-a8df-b818d8b9d49c	2024-12-04 17:44:43.763+05:30	2024-12-04 17:44:43.763+05:30	425cf02a-c3ca-41e5-b1ca-bf319c0da683	3a5cbb78-7951-4a46-9c83-911565335501
5f3a85f4-078c-4c0e-bf84-b646c46f785d	2024-12-07 13:45:33.142+05:30	2024-12-07 13:45:33.142+05:30	425cf02a-c3ca-41e5-b1ca-bf319c0da683	346fc7c1-ce06-4aae-a2f7-51a75607c180
\.


--
-- Data for Name: doctors; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.doctors (id, user_id, specialization, experience_years, created_at, updated_at, about) FROM stdin;
ee2b09ad-a9ce-4b78-b97a-12757d878481	23dd1cd7-c0f2-4c77-93ba-16190a7c79c2		0	2024-11-23 11:44:33.013+05:30	2024-11-23 11:44:33.013+05:30	0
bfd57547-80b2-4e97-adc2-c4fa5c281f99	de8801dc-b882-4d0a-aff1-d24ff7ca3124	wff	2	2024-11-29 13:18:00.702+05:30	2024-12-10 17:49:54.236+05:30	0
425cf02a-c3ca-41e5-b1ca-bf319c0da683	3447f8da-4915-4077-83ec-615fc369a558	qeefwef	2	2024-11-16 15:01:25.218+05:30	2024-12-17 16:51:58.025+05:30	0
\.


--
-- Data for Name: investigations; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.investigations (id, treatment_id, temperature, weight, blood_pressure, oxygen_saturation, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: models; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.models (id, treatment_id, data, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.notes (id, treatment_id, affected_tooth, total_cost, notes, added_by, created_at, updated_at) FROM stdin;
11238388-23c5-4d6f-a7ad-c53447444315	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	12	12312	qweqweqweqweqwe	3447f8da-4915-4077-83ec-615fc369a558	2025-01-25 11:22:55.086+05:30	2025-01-25 11:22:55.086+05:30
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.patients (id, user_id, created_at, updated_at, blood_group, marital_status, height_in_cm, emergency_contact, source) FROM stdin;
e543915a-21c6-4f4b-a71d-6e7072175d8d	03690e52-7b4d-432e-b7a8-d0bea5c2b42e	2024-11-28 13:40:26.364+05:30	2024-11-28 13:40:26.364+05:30	a	single	183cm	7898979878	other
36928d37-9531-418d-9e7b-9f3e1e823559	95ba38de-e0b3-4f9f-b7ff-9df65e0d439a	2024-12-04 12:25:01.295+05:30	2024-12-04 12:25:01.295+05:30	b+	married	152	54858858988	patient
fcd37244-29fa-40d4-9256-2eb2ec71bee1	a307c223-46b5-4c7f-a039-1375033bd5dc	2024-11-29 17:19:00.031+05:30	2024-11-29 17:19:00.031+05:30	b+	married	Nesciunt pariatur 	Consequat Sint offi	Doctor
4aea62f3-4268-4db9-bd6d-06539a81693d	56009f6c-b9f5-4a01-8257-169a5fb5038d	2024-11-13 16:05:51.161+05:30	2024-11-13 16:05:51.161+05:30	b+				\N
9f019bef-5a33-4f48-b5a5-5e98dcf79a29	9fc075d4-ef14-475e-8f02-3da11fdf0a77	2024-12-07 13:41:17.792+05:30	2024-12-07 13:41:17.792+05:30	Voluptatum expedita 	married	Cupidatat blanditiis	Modi quia et corpori	Sed incidunt qui se
83c655cc-9e6c-485e-81ca-a791f76419f5	691f123c-87cd-4ff4-8e7d-a0ecdb741b15	2024-12-09 11:31:23.138+05:30	2024-12-09 11:31:23.138+05:30	Beatae maiores quos 	single	Quia est dolore poss	Reprehenderit eos n	Est sint omnis omn
b98b430c-ad77-4f90-b471-8ab4752a8369	7e8848a4-454d-47c1-a08e-db1543fafc97	2024-12-04 10:45:08.039+05:30	2024-12-10 17:42:37.137+05:30	ab+	single	948	+918700591981	Doctor
915bf1e4-bb64-4738-9784-3d2cf53768a4	f09e3644-2752-4bcc-a994-d55149c4706e	2024-12-12 10:16:16.227+05:30	2024-12-12 10:16:16.227+05:30	o+	single	In ducimus vel ut d	+918700591131	others
67438927-06a4-4604-9d8c-dc2c48e3f92e	f974b0c8-bf6b-4bdd-a92e-0093110b337f	2024-12-12 10:23:09.808+05:30	2024-12-12 10:23:09.808+05:30	b+	single	Ut velit et nostrum 	+917011691802	others
\.


--
-- Data for Name: prescriptions; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.prescriptions (id, treatment_id, data, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: procedures; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.procedures (id, is_featured, created_at, updated_at, name, slug, image, meta_title, meta_description, meta_keywords) FROM stdin;
37277717-ecf7-4638-b521-5d52290b48e4	t	2024-11-15 16:27:24.577+05:30	2024-11-15 16:27:24.577+05:30	scaling	scaling	public/images/1731668026405_area.png			
0ddd042e-740f-42a1-8a16-443e586fa132	t	2024-11-15 16:28:32.771+05:30	2024-11-15 16:28:32.771+05:30	implants	implants	public/images/1731668301135_whatsapp_image_2024-04-23_at_12.20.56.jpeg			
7af8970e-1ef4-4b14-ba29-eb7fa53ec16b	t	2024-11-30 12:46:45.395+05:30	2024-11-30 12:46:45.395+05:30	Hayes Deleon	hayes-deleon	public/images/1732951001809_thela_brew_coffee_fb_cover_page.jpg	Dolores maiores fugi	Enim nihil non conse	Omnis sunt suscipit 
5c9a5244-010d-47f0-afe3-9bf146404079	t	2024-11-30 12:47:16.689+05:30	2024-11-30 12:47:16.689+05:30	Diana Preston	diana-preston	public/images/1732951032938_thela_brew_coffee_fb_cover_page.jpg	Reprehenderit unde d	Aut temporibus delec	Corporis pariatur D
102361e3-17be-436f-9669-f64aaf4cd015	f	2024-11-30 12:46:08.787+05:30	2024-11-30 13:07:25.534+05:30	hello	hello	public/images/1732950805698_test_fb_coverpage.jpg			
8dc7b827-9785-4b4e-9524-8174b3148138	f	2024-11-30 12:46:07.212+05:30	2024-11-30 13:09:37.33+05:30	hello again	hello-again	public/images/1732950805698_test_fb_coverpage.jpg			
68a63460-524a-46d1-9ec0-82c6e870f269	f	2024-11-30 12:47:38.982+05:30	2024-11-30 13:16:42.02+05:30	Jameson King	jameson-king	public/images/1732952492968_thela_brew_coffee_fb_cover_page.jpg	Enim voluptatum quo 	Dolores ut a ea labo	Nihil suscipit tempo
1874940c-9174-48e3-8317-677b9a7ad0b5	f	2024-12-02 10:35:04.649+05:30	2024-12-02 10:35:04.649+05:30	Amos Middleton	amos-middleton	public/images/1733115901115_thela_brew_coffee_fb_cover_page.jpg	Tempore est debiti	Voluptatum soluta om	Deleniti quaerat aut
cac2a1bf-58fe-4a6b-9e9c-34ff9d61bcb4	f	2024-12-07 13:43:57.248+05:30	2024-12-26 18:39:45.38+05:30	Quentin Clarke	quentin-clarke	public/images/1735218585350_pexels-arda-kaykisiz-672105204-19976571.jpg	Dolore adipisicing o	Tempore placeat vi	Rerum est delectus 
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.services (id, procedure_id, actual_price, discounted_price, name, image, slug, is_featured, main_points, custom_points, created_at, updated_at) FROM stdin;
346fc7c1-ce06-4aae-a2f7-51a75607c180	8dc7b827-9785-4b4e-9524-8174b3148138	438	506	Ocean Petersen	public/images/1733559253630_test_gym.jpg	ocean-petersen	f	{"Fugit consequat Ea",wqwqwe}	[{"body": ["Perspiciatis blandi", "qweqweqw"], "heading": "Totam qui quia anim "}]	2024-12-07 13:44:42.112+05:30	2024-12-14 15:28:50.185+05:30
3a5cbb78-7951-4a46-9c83-911565335501	0ddd042e-740f-42a1-8a16-443e586fa132	50	750	Ulla Santiago	public/images/1733115753379_test_fb_coverpage.jpg	ulla-santiago	f	{"Maiores in consectet","Voluptatem ut itaque"}	[{"body": ["Tempor quidem tempor", "Aperiam eos nihil it"], "heading": "Ut laboris do et opt"}]	2024-12-02 10:32:42.205+05:30	2024-12-02 13:13:58.04+05:30
c46ab3e2-6ef4-48ec-8d70-c59254fb689c	0ddd042e-740f-42a1-8a16-443e586fa132	699	499	Remove plaque and tartar	public/images/1733126092739_vedic-olympiad-certificate.jpg	remove-plaque-and-tartar	t	{"prevent tooth decay and cavities","avoid gum disease","remove stains"}	[{"body": ["prevent tooth decay and cavities", "avoid gum disease", "remove stains"], "heading": "What's included"}]	2024-11-16 12:15:13.303+05:30	2024-12-02 13:24:52.769+05:30
\.


--
-- Data for Name: slots; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.slots (id, doctor_id, clinic_id, start_time, end_time, interval_in_minute, slots, days_off, created_at, updated_at) FROM stdin;
f6a716e4-22ab-446d-b2b8-f2c01ccc8b52	425cf02a-c3ca-41e5-b1ca-bf319c0da683	425cf02a-c3ca-41e5-b1ca-bf319c0da679	08:23	23:54	50	{08:23:00,09:13:00,10:03:00,10:53:00,11:43:00,12:33:00,13:23:00,14:13:00,15:03:00,15:53:00,16:43:00,17:33:00,18:23:00,19:13:00,20:03:00,20:53:00,21:43:00,22:33:00}	{1}	2024-11-20 13:46:08.282+05:30	2024-11-20 13:46:08.282+05:30
8be83395-5c5f-40e8-b291-2de83f205588	425cf02a-c3ca-41e5-b1ca-bf319c0da683	425cf02a-c3ca-41e5-b1ca-bf319c0da672	10:00	17:30	30	{10:00:00,10:30:00,11:00:00,11:30:00,12:00:00,12:30:00,13:00:00,13:30:00,14:00:00,14:30:00,15:00:00,15:30:00,16:00:00,16:30:00,17:00:00}	{0}	2024-12-04 13:28:25.89+05:30	2024-12-07 13:46:40.679+05:30
\.


--
-- Data for Name: staffs; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.staffs (id, doctor_id, user_id, created_at, updated_at) FROM stdin;
7888b070-f41d-49a4-9389-358574ce1d21	425cf02a-c3ca-41e5-b1ca-bf319c0da683	3e025c9e-3e7a-4491-b64c-1076873709f9	2024-12-11 10:50:44.09+05:30	2024-12-11 10:50:44.09+05:30
\.


--
-- Data for Name: treatment_histories; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.treatment_histories (id, treatment_id, content, files, created_at, updated_at, added_by) FROM stdin;
\.


--
-- Data for Name: treatment_payments; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.treatment_payments (id, treatment_id, payment_type, payment_method, amount_paid, remarks, created_at, updated_at, added_by) FROM stdin;
\.


--
-- Data for Name: treatment_plans; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.treatment_plans (id, treatment_id, total_cost, notes, created_at, updated_at, status, added_by) FROM stdin;
46a952ff-7249-4fa3-9b7c-6db63e2d2b49	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	1200	wdqwdqw	2025-01-23 11:24:02.685+05:30	2025-01-23 11:24:02.685+05:30	pending	3e025c9e-3e7a-4491-b64c-1076873709f9
0b840171-ad98-4138-a02e-971684b70e5f	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	100	yfuy	2025-01-23 11:32:48.381+05:30	2025-01-23 11:32:48.381+05:30	pending	3447f8da-4915-4077-83ec-615fc369a558
\.


--
-- Data for Name: treatment_prescriptions; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.treatment_prescriptions (id, treatment_id, data, created_at, updated_at, added_by) FROM stdin;
\.


--
-- Data for Name: treatments; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.treatments (id, clinic_id, patient_id, service_id, appointment_id, created_at, updated_at, cost) FROM stdin;
9648c7ef-bd1b-430a-a169-94bbc42fe0aa	425cf02a-c3ca-41e5-b1ca-bf319c0da672	915bf1e4-bb64-4738-9784-3d2cf53768a4	3a5cbb78-7951-4a46-9c83-911565335501	1be3733b-26c2-4d25-9da6-507196e399ac	2025-01-21 13:43:55.154+05:30	2025-01-21 13:43:55.154+05:30	750
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.users (id, username, email, mobile_number, country_code, fullname, password, is_active, role, reset_password_token, confirmation_token, created_at, updated_at, dob, gender, avatar) FROM stdin;
95ba38de-e0b3-4f9f-b7ff-9df65e0d439a	Sabhubhu	njd@gmail.com	8898988989	91	cvgfd	$2b$10$IZhClwUnYvLVfRsfRoyCHeHaJakZbhXISvv8kpQAkxtpgOr2l7bmW	t	patient	\N	\N	2024-12-04 12:25:01.286+05:30	2024-12-04 12:25:01.286+05:30	2024-12-02	male	
9fc075d4-ef14-475e-8f02-3da11fdf0a77	sutiz	qivykun@mailinator.com	7052191802	91	Fritz Frazier	$2b$10$EtRgirNWI5PR7P4/PSfHVeH35Q1.lBUTCSaDfgozZU3KhxrPXkkia	t	patient	\N	\N	2024-12-07 13:41:17.782+05:30	2024-12-07 13:41:17.782+05:30	2024-12-02	male	public/images/1733559054152_test_gym.jpg
691f123c-87cd-4ff4-8e7d-a0ecdb741b15	mulosaha	xovibahab@mailinator.com	8787641131	91	Baker Rose	$2b$10$Taub4j4lgJUrHOUESbaFrujD51f1bphwVTa24O1wbBat3XXY3qdNi	t	patient	\N	\N	2024-12-09 11:31:23.131+05:30	2024-12-09 11:31:23.131+05:30	2024-12-01	other	public/images/1733724066323_test_gym.jpg
de8801dc-b882-4d0a-aff1-d24ff7ca3124	doctor4	qyjy@mailinator.com	7017891802	91	Vishal Gautam	$2b$10$qAqRWtPyRx022kVW3NxGPeKt7tFyjgnpuCRgqWbT0ND0t.ZMAmHTW	t	doctor	\N	\N	2024-11-29 13:18:00.687+05:30	2024-12-10 17:49:54.227+05:30	2024-11-12	other	public/images/1733731810711_test_fb_coverpage.jpg
f09e3644-2752-4bcc-a994-d55149c4706e	qojaje	mebyc@mailinator.com	7011678667	91	Vishal Gautam	$2b$10$dlxJiBxam.4xOav11xHhrOOvKQqgHk54v/zeffDmc4dlspNCeeu7W	t	patient	\N	\N	2024-12-12 10:16:16.216+05:30	2024-12-12 10:16:16.216+05:30	2024-12-05	female	public/images/1733978771943_test_gym.jpg
f974b0c8-bf6b-4bdd-a92e-0093110b337f	kijyvytyr	ritybof@mailinator.com	8700576132	91	Ori Colon	$2b$10$WApUhXOKEZcWkmfkSmqOmutmQHi9ea4dhfYjIIZuwbzdzIINRnChC	t	patient	\N	\N	2024-12-12 10:23:09.8+05:30	2024-12-12 10:23:09.8+05:30	2024-12-18	other	public/images/1733979178936_test_fb_coverpage.jpg
3e025c9e-3e7a-4491-b64c-1076873709f9	staff	cakylefyra@mailinator.com	7011691981	91	Vishal Gautam	$2b$10$hRgu7lDL23WhHskIpPu5G.IW5aEuJaFwD/flMbaU5UfDFV/gsTPCC	t	staff	\N	\N	2024-12-11 10:50:44.007+05:30	2024-12-12 11:27:44.205+05:30	2011-12-02	male	public/images/1733894419263_test_gym.jpg
3447f8da-4915-4077-83ec-615fc369a558	doctor	doctor@gmail.com	7011691804	91	doctor sharma	$2b$10$j6y08UcKoMWEE8.mVEgpQOndElXod8ew62lRUKBWSWwlOwFgrF66m	t	doctor	\N	\N	2024-11-16 15:01:25.214+05:30	2024-12-17 16:51:58.014+05:30	1999-09-13	male	public/images/1734434510393_pexels-kindelmedia-8326324.jpg
907e5955-7fd5-435d-9f5f-04e77c5950c9	admin	vishal@gmail.com	7011691802	91	Vishal Gautam	$2b$10$rBksBzoDjTRTGSEX7OoB..W4GeYKb3DqFyV4Ee24ok2sSiZ7.avOi	t	admin	\N	\N	2024-11-12 18:04:47.527+05:30	2024-12-09 16:06:31.329+05:30	1999-09-13	male	public/images/1733737899339_test_gym.jpg
a307c223-46b5-4c7f-a039-1375033bd5dc	kekuvunemy	zonu@mailinator.com	826069359	1	Benjamin Kennedy	$2b$10$u6ZN1d3SzuVhSa51YvfpEOQSt.ZAd.s56HZZL7PSYMs3F0PuA7D0C	t	patient	\N	\N	2024-11-29 17:19:00.01+05:30	2024-11-29 17:19:00.01+05:30	2024-11-06	other	
7e8848a4-454d-47c1-a08e-db1543fafc97	vishal	gwggag@gmail.com	8429639385	91	vishal gautam	$2b$10$.YaV5bAgyoa2iq7ZRQczkOky2VGdop0XG18vKjPi1Njw/6TOZByRy	t	patient	\N	\N	2024-12-04 10:45:08.033+05:30	2024-12-10 17:42:37.134+05:30	2024-12-04	male	public/images/1733827158507_test_gym.jpg
56009f6c-b9f5-4a01-8257-169a5fb5038d	patient	1@gmail.com	7011691803	91	patient	$2b$10$3IGiVwHRjztG1.gR1srTRuEAGutrl0Rn.fNug1IuA/mYpVeROa4CK	t	patient	\N	\N	2024-11-13 16:05:51.153+05:30	2024-11-16 11:57:43.357+05:30	1998-09-13	male	
23dd1cd7-c0f2-4c77-93ba-16190a7c79c2	paluhow	xopequd@mailinator.com	8700591112	91	Lucius Fox	$2b$10$/p67jJDxCCRdo.6PEr9Y8uur6MYIUOPj2KxPGQG6b40e8qH/7IkTe	t	doctor	\N	\N	2024-11-23 11:44:33.009+05:30	2024-11-23 11:44:33.009+05:30	2024-11-05	female	
03690e52-7b4d-432e-b7a8-d0bea5c2b42e	patient3	3@gmail.com	7011691873	91	patient	$2b$10$EjkqaIuv..SSV4tCS0pfxulvazOoCjZmzQWb99UZD49pyhIDk8uMu	t	patient	\N	\N	2024-11-28 13:40:26.359+05:30	2024-11-28 13:40:26.359+05:30	1998-09-13	male	
\.


--
-- Data for Name: xrays; Type: TABLE DATA; Schema: public; Owner: drdipti
--

COPY public.xrays (id, treatment_id, title, image, added_by, created_at, updated_at) FROM stdin;
1acff8af-0347-49d3-9112-79facb42732b	9648c7ef-bd1b-430a-a169-94bbc42fe0aa	xray	public/images/1737791109063_fashion.webp	3447f8da-4915-4077-83ec-615fc369a558	2025-01-25 12:40:22.522+05:30	2025-01-25 13:15:09.102+05:30
\.


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: blocked_slots blocked_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.blocked_slots
    ADD CONSTRAINT blocked_slots_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_mappings clinic_patient_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinic_patient_mappings
    ADD CONSTRAINT clinic_patient_mappings_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_mappings clinic_staff_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinic_staff_mappings
    ADD CONSTRAINT clinic_staff_mappings_pkey PRIMARY KEY (id);


--
-- Name: clinics clinics_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_pkey PRIMARY KEY (id);


--
-- Name: comprehensive_examinations comprehensive_examinations_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.comprehensive_examinations
    ADD CONSTRAINT comprehensive_examinations_pkey PRIMARY KEY (id);


--
-- Name: dental_charts dental_charts_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.dental_charts
    ADD CONSTRAINT dental_charts_pkey PRIMARY KEY (id);


--
-- Name: dental_notes dental_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.dental_notes
    ADD CONSTRAINT dental_notes_pkey PRIMARY KEY (id);


--
-- Name: doctor_patient_mappings doctor_patient_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctor_patient_mappings
    ADD CONSTRAINT doctor_patient_mappings_pkey PRIMARY KEY (id);


--
-- Name: doctor_service_mappings doctor_service_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctor_service_mappings
    ADD CONSTRAINT doctor_service_mappings_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: investigations investigations_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_pkey PRIMARY KEY (id);


--
-- Name: models models_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: procedures procedures_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.procedures
    ADD CONSTRAINT procedures_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: services services_slug_key; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_slug_key UNIQUE (slug);


--
-- Name: slots slots_clinic_id_key; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_clinic_id_key UNIQUE (clinic_id);


--
-- Name: slots slots_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_pkey PRIMARY KEY (id);


--
-- Name: staffs staffs_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.staffs
    ADD CONSTRAINT staffs_pkey PRIMARY KEY (id);


--
-- Name: treatment_histories treatment_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_histories
    ADD CONSTRAINT treatment_histories_pkey PRIMARY KEY (id);


--
-- Name: treatment_payments treatment_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_payments
    ADD CONSTRAINT treatment_payments_pkey PRIMARY KEY (id);


--
-- Name: treatment_plans treatment_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_pkey PRIMARY KEY (id);


--
-- Name: treatment_prescriptions treatment_prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_prescriptions
    ADD CONSTRAINT treatment_prescriptions_pkey PRIMARY KEY (id);


--
-- Name: treatments treatments_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_mobile_number_key; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_mobile_number_key UNIQUE (mobile_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: xrays xrays_pkey; Type: CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.xrays
    ADD CONSTRAINT xrays_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: appointments appointments_clinic_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_clinic_id_fkey1 FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: appointments appointments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: blocked_slots blocked_slots_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.blocked_slots
    ADD CONSTRAINT blocked_slots_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: bookings bookings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: bookings bookings_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: bookings bookings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: bookings bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: clinic_patient_mappings clinic_patient_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinic_patient_mappings
    ADD CONSTRAINT clinic_patient_mappings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: clinic_patient_mappings clinic_patient_mappings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinic_patient_mappings
    ADD CONSTRAINT clinic_patient_mappings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: clinic_staff_mappings clinic_staff_mappings_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinic_staff_mappings
    ADD CONSTRAINT clinic_staff_mappings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: clinic_staff_mappings clinic_staff_mappings_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinic_staff_mappings
    ADD CONSTRAINT clinic_staff_mappings_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staffs(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: clinics clinics_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.clinics
    ADD CONSTRAINT clinics_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: comprehensive_examinations comprehensive_examinations_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.comprehensive_examinations
    ADD CONSTRAINT comprehensive_examinations_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: comprehensive_examinations comprehensive_examinations_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.comprehensive_examinations
    ADD CONSTRAINT comprehensive_examinations_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: dental_charts dental_charts_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.dental_charts
    ADD CONSTRAINT dental_charts_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: dental_charts dental_charts_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.dental_charts
    ADD CONSTRAINT dental_charts_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: dental_notes dental_notes_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.dental_notes
    ADD CONSTRAINT dental_notes_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: dental_notes dental_notes_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.dental_notes
    ADD CONSTRAINT dental_notes_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: doctor_patient_mappings doctor_patient_mappings_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctor_patient_mappings
    ADD CONSTRAINT doctor_patient_mappings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: doctor_patient_mappings doctor_patient_mappings_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctor_patient_mappings
    ADD CONSTRAINT doctor_patient_mappings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: doctor_service_mappings doctor_service_mappings_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctor_service_mappings
    ADD CONSTRAINT doctor_service_mappings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: doctor_service_mappings doctor_service_mappings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctor_service_mappings
    ADD CONSTRAINT doctor_service_mappings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: doctors doctors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: investigations investigations_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.investigations
    ADD CONSTRAINT investigations_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: notes notes_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: notes notes_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: patients patients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: services services_procedure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.procedures(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: slots slots_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: slots slots_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.slots
    ADD CONSTRAINT slots_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: staffs staffs_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.staffs
    ADD CONSTRAINT staffs_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: staffs staffs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.staffs
    ADD CONSTRAINT staffs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_histories treatment_histories_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_histories
    ADD CONSTRAINT treatment_histories_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_histories treatment_histories_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_histories
    ADD CONSTRAINT treatment_histories_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_payments treatment_payments_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_payments
    ADD CONSTRAINT treatment_payments_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_payments treatment_payments_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_payments
    ADD CONSTRAINT treatment_payments_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_plans treatment_plans_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_plans treatment_plans_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_plans
    ADD CONSTRAINT treatment_plans_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_prescriptions treatment_prescriptions_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_prescriptions
    ADD CONSTRAINT treatment_prescriptions_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatment_prescriptions treatment_prescriptions_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatment_prescriptions
    ADD CONSTRAINT treatment_prescriptions_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatments treatments_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.bookings(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatments treatments_clinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatments treatments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: treatments treatments_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.treatments
    ADD CONSTRAINT treatments_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: xrays xrays_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.xrays
    ADD CONSTRAINT xrays_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE CASCADE DEFERRABLE;


--
-- Name: xrays xrays_treatment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: drdipti
--

ALTER TABLE ONLY public.xrays
    ADD CONSTRAINT xrays_treatment_id_fkey FOREIGN KEY (treatment_id) REFERENCES public.treatments(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE;


--
-- PostgreSQL database dump complete
--

