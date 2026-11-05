--
-- PostgreSQL database dump
--

\restrict P9kuNYzPP3wRuEQfF7bB512mqeTU3LQQoSZq0R4EzueYIIzf5iyQRBxUO9uzXSu

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

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
-- Name: account_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.account_status AS ENUM (
    'Active',
    'Blocked',
    'Pending'
);


--
-- Name: feedback_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.feedback_status AS ENUM (
    'New',
    'Processing',
    'Resolved',
    'Rejected'
);


--
-- Name: feedback_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.feedback_type AS ENUM (
    'Product',
    'Service',
    'Staff',
    'Complaint',
    'Suggestion'
);


--
-- Name: gender_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_type AS ENUM (
    'Male',
    'Female',
    'Other'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'Pending',
    'Confirmed',
    'Processing',
    'Shipped',
    'Delivered',
    'Cancelled',
    'Refunded'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'Cash',
    'BankTransfer',
    'Momo',
    'VNPay',
    'ZaloPay'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'Pending',
    'Paid',
    'Failed',
    'Refunded'
);


--
-- Name: promotion_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.promotion_type AS ENUM (
    'Percent',
    'FixedAmount'
);


--
-- Name: question_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_type AS ENUM (
    'SingleChoice',
    'MultiChoice',
    'Text',
    'Rating'
);


--
-- Name: receipt_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.receipt_type AS ENUM (
    'Import',
    'Export',
    'Adjustment'
);


--
-- Name: survey_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.survey_status AS ENUM (
    'Draft',
    'Active',
    'Closed'
);


--
-- Name: user_promo_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_promo_status AS ENUM (
    'Available',
    'Used',
    'Expired'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    account_id integer NOT NULL,
    role_id integer NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email character varying(150),
    phone character varying(20),
    status public.account_status DEFAULT 'Active'::public.account_status NOT NULL,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.account_account_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: account_account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.account_account_id_seq OWNED BY public.account.account_id;


--
-- Name: brand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand (
    brand_id integer NOT NULL,
    brand_name character varying(150) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: brand_brand_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.brand_brand_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brand_brand_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brand_brand_id_seq OWNED BY public.brand.brand_id;


--
-- Name: category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category (
    category_id integer NOT NULL,
    category_name character varying(100) NOT NULL,
    description text,
    parent_id integer,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: category_category_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.category_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.category_category_id_seq OWNED BY public.category.category_id;


--
-- Name: chat_message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message (
    message_id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_account_id integer NOT NULL,
    content text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    CONSTRAINT chat_message_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 5000)))
);


--
-- Name: chat_message_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_attachment (
    attachment_id bigint NOT NULL,
    message_id integer NOT NULL,
    storage_name character varying(100) NOT NULL,
    original_name character varying(255) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_message_attachment_file_size_check CHECK ((file_size > 0)),
    CONSTRAINT chat_message_attachment_mime_type_check CHECK (((mime_type)::text = ANY ((ARRAY['image/jpeg'::character varying, 'image/png'::character varying, 'image/webp'::character varying, 'image/gif'::character varying, 'video/mp4'::character varying, 'video/webm'::character varying, 'application/pdf'::character varying, 'text/plain'::character varying, 'text/csv'::character varying, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'::character varying, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'::character varying])::text[])))
);


--
-- Name: chat_message_attachment_attachment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_message_attachment_attachment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_message_attachment_attachment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_message_attachment_attachment_id_seq OWNED BY public.chat_message_attachment.attachment_id;


--
-- Name: chat_message_message_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_message_message_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_message_message_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_message_message_id_seq OWNED BY public.chat_message.message_id;


--
-- Name: color; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.color (
    color_id integer NOT NULL,
    color_name character varying(50) NOT NULL,
    hex_code character(7)
);


--
-- Name: color_color_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.color_color_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: color_color_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.color_color_id_seq OWNED BY public.color.color_id;


--
-- Name: conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation (
    conversation_id integer NOT NULL,
    customer_id integer NOT NULL,
    assigned_to integer,
    subject character varying(300) DEFAULT 'Hỗ trợ khách hàng'::character varying NOT NULL,
    status character varying(20) DEFAULT 'Open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_status_check CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'Resolved'::character varying, 'Closed'::character varying])::text[])))
);


--
-- Name: conversation_conversation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversation_conversation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversation_conversation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversation_conversation_id_seq OWNED BY public.conversation.conversation_id;


--
-- Name: customer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer (
    customer_id integer NOT NULL,
    account_id integer,
    full_name character varying(150) NOT NULL,
    gender public.gender_type,
    date_of_birth date,
    phone character varying(20),
    email character varying(150),
    address text,
    loyalty_point integer DEFAULT 0 NOT NULL,
    customer_tier character varying(20) DEFAULT 'New'::character varying NOT NULL,
    registered_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_customer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_customer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_customer_id_seq OWNED BY public.customer.customer_id;


--
-- Name: customer_interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_interest (
    customer_id integer NOT NULL,
    interest_id integer NOT NULL
);


--
-- Name: demo_payment_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demo_payment_tokens (
    demo_payment_token_id bigint NOT NULL,
    order_id integer NOT NULL,
    token_hash character(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: demo_payment_tokens_demo_payment_token_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.demo_payment_tokens ALTER COLUMN demo_payment_token_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.demo_payment_tokens_demo_payment_token_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee (
    employee_id integer NOT NULL,
    account_id integer,
    full_name character varying(150) NOT NULL,
    gender public.gender_type,
    date_of_birth date,
    phone character varying(20),
    email character varying(150),
    address text,
    "position" character varying(100),
    hire_date date DEFAULT CURRENT_DATE NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_employee_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_employee_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_employee_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_employee_id_seq OWNED BY public.employee.employee_id;


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    feedback_id integer NOT NULL,
    customer_id integer,
    product_id integer,
    order_id integer,
    employee_id integer,
    feedback_type public.feedback_type DEFAULT 'Product'::public.feedback_type NOT NULL,
    rating smallint,
    content text NOT NULL,
    reply text,
    status public.feedback_status DEFAULT 'New'::public.feedback_status NOT NULL,
    replied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_product_requires_product_and_rating CHECK (((feedback_type <> 'Product'::public.feedback_type) OR ((product_id IS NOT NULL) AND (rating IS NOT NULL)))),
    CONSTRAINT feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: feedback_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_attachment (
    attachment_id bigint NOT NULL,
    feedback_id integer NOT NULL,
    media_url text NOT NULL,
    media_type character varying(10) NOT NULL,
    mime_type character varying(100) NOT NULL,
    original_name text NOT NULL,
    file_size bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feedback_attachment_file_size_check CHECK ((file_size > 0)),
    CONSTRAINT feedback_attachment_media_type_check CHECK (((media_type)::text = ANY ((ARRAY['image'::character varying, 'video'::character varying])::text[])))
);


--
-- Name: feedback_attachment_attachment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_attachment_attachment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_attachment_attachment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_attachment_attachment_id_seq OWNED BY public.feedback_attachment.attachment_id;


--
-- Name: feedback_feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_feedback_id_seq OWNED BY public.feedback.feedback_id;


--
-- Name: import_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_detail (
    detail_id integer NOT NULL,
    receipt_id integer NOT NULL,
    variant_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    CONSTRAINT import_detail_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT import_detail_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: import_detail_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_detail_detail_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_detail_detail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_detail_detail_id_seq OWNED BY public.import_detail.detail_id;


--
-- Name: import_receipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_receipt (
    receipt_id integer NOT NULL,
    supplier_id integer,
    employee_id integer,
    receipt_type public.receipt_type DEFAULT 'Import'::public.receipt_type NOT NULL,
    note text,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    receipt_date timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: import_receipt_receipt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_receipt_receipt_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_receipt_receipt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_receipt_receipt_id_seq OWNED BY public.import_receipt.receipt_id;


--
-- Name: interest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest (
    interest_id integer NOT NULL,
    interest_name character varying(100) NOT NULL
);


--
-- Name: interest_interest_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.interest_interest_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: interest_interest_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.interest_interest_id_seq OWNED BY public.interest.interest_id;


--
-- Name: loyalty_point_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_point_transaction (
    loyalty_transaction_id bigint NOT NULL,
    customer_id integer NOT NULL,
    order_id integer,
    transaction_type character varying(32) NOT NULL,
    points_delta integer NOT NULL,
    balance_after integer NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loyalty_point_transaction_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['OpeningBalance'::character varying, 'Earned'::character varying, 'Redeemed'::character varying, 'RedeemedReturned'::character varying, 'EarnReversed'::character varying])::text[])))
);


--
-- Name: loyalty_point_transaction_loyalty_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loyalty_point_transaction_loyalty_transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loyalty_point_transaction_loyalty_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loyalty_point_transaction_loyalty_transaction_id_seq OWNED BY public.loyalty_point_transaction.loyalty_transaction_id;


--
-- Name: order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."order" (
    order_id integer NOT NULL,
    customer_id integer,
    employee_id integer,
    promotion_id integer,
    order_status public.order_status DEFAULT 'Pending'::public.order_status NOT NULL,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amt numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) DEFAULT 0 NOT NULL,
    note text,
    shipping_address text,
    order_channel character varying(50) DEFAULT 'InStore'::character varying NOT NULL,
    ordered_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    loyalty_points_redeemed integer DEFAULT 0 NOT NULL,
    loyalty_discount numeric(15,2) DEFAULT 0 NOT NULL
);


--
-- Name: order_detail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_detail (
    detail_id integer NOT NULL,
    order_id integer NOT NULL,
    variant_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    subtotal numeric(15,2) GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED,
    CONSTRAINT order_detail_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_detail_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: order_detail_detail_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_detail_detail_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_detail_detail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_detail_detail_id_seq OWNED BY public.order_detail.detail_id;


--
-- Name: order_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_order_id_seq OWNED BY public."order".order_id;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    event_id text NOT NULL,
    topic text NOT NULL,
    partition_key text,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT outbox_events_topic_check CHECK ((topic = ANY (ARRAY['user-events'::text, 'transaction-events'::text])))
);


--
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    payment_id integer NOT NULL,
    order_id integer NOT NULL,
    method public.payment_method DEFAULT 'Cash'::public.payment_method NOT NULL,
    status public.payment_status DEFAULT 'Pending'::public.payment_status NOT NULL,
    amount numeric(15,2) NOT NULL,
    transaction_ref character varying(200),
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: payment_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_payment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_payment_id_seq OWNED BY public.payment.payment_id;


--
-- Name: permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permission (
    permission_id integer NOT NULL,
    permission_code character varying(80) NOT NULL,
    description text
);


--
-- Name: permission_permission_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permission_permission_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permission_permission_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permission_permission_id_seq OWNED BY public.permission.permission_id;


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    product_id integer NOT NULL,
    category_id integer NOT NULL,
    brand_id integer,
    product_name character varying(200) NOT NULL,
    description text,
    import_price numeric(15,2) NOT NULL,
    selling_price numeric(15,2) NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier_id integer,
    CONSTRAINT product_import_price_check CHECK ((import_price >= (0)::numeric)),
    CONSTRAINT product_selling_price_check CHECK ((selling_price >= (0)::numeric))
);


--
-- Name: product_image; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_image (
    image_id integer NOT NULL,
    product_id integer NOT NULL,
    image_url text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    display_order smallint DEFAULT 1 NOT NULL
);


--
-- Name: product_image_image_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_image_image_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_image_image_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_image_image_id_seq OWNED BY public.product_image.image_id;


--
-- Name: product_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_product_id_seq OWNED BY public.product.product_id;


--
-- Name: product_variant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variant (
    variant_id integer NOT NULL,
    product_id integer NOT NULL,
    size_id integer NOT NULL,
    color_id integer NOT NULL,
    sku character varying(100),
    quantity integer DEFAULT 0 NOT NULL,
    selling_price numeric(15,2),
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT product_variant_quantity_check CHECK ((quantity >= 0)),
    CONSTRAINT product_variant_selling_price_check CHECK (((selling_price IS NULL) OR (selling_price >= (0)::numeric)))
);


--
-- Name: product_variant_variant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_variant_variant_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_variant_variant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_variant_variant_id_seq OWNED BY public.product_variant.variant_id;


--
-- Name: promotion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotion (
    promotion_id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(200) NOT NULL,
    promo_type public.promotion_type DEFAULT 'Percent'::public.promotion_type NOT NULL,
    value numeric(10,2) NOT NULL,
    min_order numeric(15,2) DEFAULT 0 NOT NULL,
    max_discount numeric(15,2),
    usage_limit integer,
    used_count integer DEFAULT 0 NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_check CHECK ((end_date >= start_date)),
    CONSTRAINT promotion_value_check CHECK ((value > (0)::numeric))
);


--
-- Name: promotion_promotion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promotion_promotion_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promotion_promotion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promotion_promotion_id_seq OWNED BY public.promotion.promotion_id;


--
-- Name: role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role (
    role_id integer NOT NULL,
    role_name character varying(50) NOT NULL,
    description text
);


--
-- Name: role_permission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permission (
    role_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: role_role_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_role_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_role_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_role_id_seq OWNED BY public.role.role_id;


--
-- Name: size; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.size (
    size_id integer NOT NULL,
    size_name character varying(20) NOT NULL
);


--
-- Name: size_size_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.size_size_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: size_size_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.size_size_id_seq OWNED BY public.size.size_id;


--
-- Name: store_admin_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_admin_schema_migrations (
    version character varying(32) NOT NULL,
    name text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier (
    supplier_id integer NOT NULL,
    supplier_name character varying(200) NOT NULL,
    contact_name character varying(150),
    phone character varying(20),
    email character varying(150),
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_supplier_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_supplier_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_supplier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_supplier_id_seq OWNED BY public.supplier.supplier_id;


--
-- Name: survey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey (
    survey_id integer NOT NULL,
    created_by integer,
    title character varying(300) NOT NULL,
    description text,
    target_gender public.gender_type,
    target_tier character varying(20),
    min_age integer,
    max_age integer,
    status public.survey_status DEFAULT 'Draft'::public.survey_status NOT NULL,
    start_date date,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_interest_id integer,
    reward_promotion_id integer,
    CONSTRAINT survey_age_range_check CHECK ((((min_age IS NULL) OR (min_age >= 0)) AND ((max_age IS NULL) OR (max_age >= 0)) AND ((min_age IS NULL) OR (max_age IS NULL) OR (min_age <= max_age)))),
    CONSTRAINT survey_date_range_check CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (start_date <= end_date)))
);


--
-- Name: survey_answer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_answer (
    answer_id integer NOT NULL,
    response_id integer NOT NULL,
    question_id integer NOT NULL,
    option_id integer,
    answer_text text
);


--
-- Name: survey_answer_answer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_answer_answer_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_answer_answer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_answer_answer_id_seq OWNED BY public.survey_answer.answer_id;


--
-- Name: survey_invitation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_invitation (
    invitation_id integer NOT NULL,
    survey_id integer NOT NULL,
    customer_id integer NOT NULL,
    invited_by integer,
    status character varying(20) DEFAULT 'Sent'::character varying NOT NULL,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT survey_invitation_status_check CHECK (((status)::text = ANY ((ARRAY['Sent'::character varying, 'Opened'::character varying, 'Completed'::character varying])::text[])))
);


--
-- Name: survey_invitation_invitation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_invitation_invitation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_invitation_invitation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_invitation_invitation_id_seq OWNED BY public.survey_invitation.invitation_id;


--
-- Name: survey_option; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_option (
    option_id integer NOT NULL,
    question_id integer NOT NULL,
    option_text character varying(300) NOT NULL,
    display_order smallint DEFAULT 1 NOT NULL
);


--
-- Name: survey_option_option_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_option_option_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_option_option_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_option_option_id_seq OWNED BY public.survey_option.option_id;


--
-- Name: survey_question; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_question (
    question_id integer NOT NULL,
    survey_id integer NOT NULL,
    question_text text NOT NULL,
    question_type public.question_type DEFAULT 'SingleChoice'::public.question_type NOT NULL,
    display_order smallint DEFAULT 1 NOT NULL,
    is_required boolean DEFAULT true NOT NULL
);


--
-- Name: survey_question_question_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_question_question_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_question_question_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_question_question_id_seq OWNED BY public.survey_question.question_id;


--
-- Name: survey_response; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.survey_response (
    response_id integer NOT NULL,
    survey_id integer NOT NULL,
    customer_id integer,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: survey_response_response_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_response_response_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_response_response_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_response_response_id_seq OWNED BY public.survey_response.response_id;


--
-- Name: survey_survey_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.survey_survey_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: survey_survey_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.survey_survey_id_seq OWNED BY public.survey.survey_id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id bigint NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id text,
    session_id text,
    event_type text NOT NULL,
    transaction_id text,
    benchmark_run_id text,
    amount numeric(15,2),
    currency text,
    status text,
    item_count integer,
    page text,
    action text,
    producer_source text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.transactions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_events (
    id bigint NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id text,
    session_id text,
    event_type text NOT NULL,
    page text,
    section text,
    action text,
    source_check text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text
);


--
-- Name: user_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.user_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.user_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_promotion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_promotion (
    user_promo_id integer NOT NULL,
    customer_id integer NOT NULL,
    promotion_id integer NOT NULL,
    status public.user_promo_status DEFAULT 'Available'::public.user_promo_status NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: user_promotion_user_promo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_promotion_user_promo_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_promotion_user_promo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_promotion_user_promo_id_seq OWNED BY public.user_promotion.user_promo_id;


--
-- Name: account account_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account ALTER COLUMN account_id SET DEFAULT nextval('public.account_account_id_seq'::regclass);


--
-- Name: brand brand_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand ALTER COLUMN brand_id SET DEFAULT nextval('public.brand_brand_id_seq'::regclass);


--
-- Name: category category_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category ALTER COLUMN category_id SET DEFAULT nextval('public.category_category_id_seq'::regclass);


--
-- Name: chat_message message_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message ALTER COLUMN message_id SET DEFAULT nextval('public.chat_message_message_id_seq'::regclass);


--
-- Name: chat_message_attachment attachment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_attachment ALTER COLUMN attachment_id SET DEFAULT nextval('public.chat_message_attachment_attachment_id_seq'::regclass);


--
-- Name: color color_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color ALTER COLUMN color_id SET DEFAULT nextval('public.color_color_id_seq'::regclass);


--
-- Name: conversation conversation_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation ALTER COLUMN conversation_id SET DEFAULT nextval('public.conversation_conversation_id_seq'::regclass);


--
-- Name: customer customer_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer ALTER COLUMN customer_id SET DEFAULT nextval('public.customer_customer_id_seq'::regclass);


--
-- Name: employee employee_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee ALTER COLUMN employee_id SET DEFAULT nextval('public.employee_employee_id_seq'::regclass);


--
-- Name: feedback feedback_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN feedback_id SET DEFAULT nextval('public.feedback_feedback_id_seq'::regclass);


--
-- Name: feedback_attachment attachment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_attachment ALTER COLUMN attachment_id SET DEFAULT nextval('public.feedback_attachment_attachment_id_seq'::regclass);


--
-- Name: import_detail detail_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_detail ALTER COLUMN detail_id SET DEFAULT nextval('public.import_detail_detail_id_seq'::regclass);


--
-- Name: import_receipt receipt_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_receipt ALTER COLUMN receipt_id SET DEFAULT nextval('public.import_receipt_receipt_id_seq'::regclass);


--
-- Name: interest interest_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest ALTER COLUMN interest_id SET DEFAULT nextval('public.interest_interest_id_seq'::regclass);


--
-- Name: loyalty_point_transaction loyalty_transaction_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_point_transaction ALTER COLUMN loyalty_transaction_id SET DEFAULT nextval('public.loyalty_point_transaction_loyalty_transaction_id_seq'::regclass);


--
-- Name: order order_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order" ALTER COLUMN order_id SET DEFAULT nextval('public.order_order_id_seq'::regclass);


--
-- Name: order_detail detail_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_detail ALTER COLUMN detail_id SET DEFAULT nextval('public.order_detail_detail_id_seq'::regclass);


--
-- Name: payment payment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment ALTER COLUMN payment_id SET DEFAULT nextval('public.payment_payment_id_seq'::regclass);


--
-- Name: permission permission_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission ALTER COLUMN permission_id SET DEFAULT nextval('public.permission_permission_id_seq'::regclass);


--
-- Name: product product_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product ALTER COLUMN product_id SET DEFAULT nextval('public.product_product_id_seq'::regclass);


--
-- Name: product_image image_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image ALTER COLUMN image_id SET DEFAULT nextval('public.product_image_image_id_seq'::regclass);


--
-- Name: product_variant variant_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant ALTER COLUMN variant_id SET DEFAULT nextval('public.product_variant_variant_id_seq'::regclass);


--
-- Name: promotion promotion_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion ALTER COLUMN promotion_id SET DEFAULT nextval('public.promotion_promotion_id_seq'::regclass);


--
-- Name: role role_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role ALTER COLUMN role_id SET DEFAULT nextval('public.role_role_id_seq'::regclass);


--
-- Name: size size_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size ALTER COLUMN size_id SET DEFAULT nextval('public.size_size_id_seq'::regclass);


--
-- Name: supplier supplier_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier ALTER COLUMN supplier_id SET DEFAULT nextval('public.supplier_supplier_id_seq'::regclass);


--
-- Name: survey survey_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey ALTER COLUMN survey_id SET DEFAULT nextval('public.survey_survey_id_seq'::regclass);


--
-- Name: survey_answer answer_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answer ALTER COLUMN answer_id SET DEFAULT nextval('public.survey_answer_answer_id_seq'::regclass);


--
-- Name: survey_invitation invitation_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_invitation ALTER COLUMN invitation_id SET DEFAULT nextval('public.survey_invitation_invitation_id_seq'::regclass);


--
-- Name: survey_option option_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_option ALTER COLUMN option_id SET DEFAULT nextval('public.survey_option_option_id_seq'::regclass);


--
-- Name: survey_question question_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_question ALTER COLUMN question_id SET DEFAULT nextval('public.survey_question_question_id_seq'::regclass);


--
-- Name: survey_response response_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response ALTER COLUMN response_id SET DEFAULT nextval('public.survey_response_response_id_seq'::regclass);


--
-- Name: user_promotion user_promo_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_promotion ALTER COLUMN user_promo_id SET DEFAULT nextval('public.user_promotion_user_promo_id_seq'::regclass);


--
-- Name: account account_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_email_key UNIQUE (email);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (account_id);


--
-- Name: account account_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_username_key UNIQUE (username);


--
-- Name: brand brand_brand_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand
    ADD CONSTRAINT brand_brand_name_key UNIQUE (brand_name);


--
-- Name: brand brand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand
    ADD CONSTRAINT brand_pkey PRIMARY KEY (brand_id);


--
-- Name: category category_category_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_category_name_key UNIQUE (category_name);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (category_id);


--
-- Name: chat_message_attachment chat_message_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_attachment
    ADD CONSTRAINT chat_message_attachment_pkey PRIMARY KEY (attachment_id);


--
-- Name: chat_message_attachment chat_message_attachment_storage_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_attachment
    ADD CONSTRAINT chat_message_attachment_storage_name_key UNIQUE (storage_name);


--
-- Name: chat_message chat_message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT chat_message_pkey PRIMARY KEY (message_id);


--
-- Name: color color_color_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color
    ADD CONSTRAINT color_color_name_key UNIQUE (color_name);


--
-- Name: color color_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.color
    ADD CONSTRAINT color_pkey PRIMARY KEY (color_id);


--
-- Name: conversation conversation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (conversation_id);


--
-- Name: customer customer_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_account_id_key UNIQUE (account_id);


--
-- Name: customer_interest customer_interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interest
    ADD CONSTRAINT customer_interest_pkey PRIMARY KEY (customer_id, interest_id);


--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (customer_id);


--
-- Name: demo_payment_tokens demo_payment_tokens_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_payment_tokens
    ADD CONSTRAINT demo_payment_tokens_order_id_key UNIQUE (order_id);


--
-- Name: demo_payment_tokens demo_payment_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_payment_tokens
    ADD CONSTRAINT demo_payment_tokens_pkey PRIMARY KEY (demo_payment_token_id);


--
-- Name: demo_payment_tokens demo_payment_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_payment_tokens
    ADD CONSTRAINT demo_payment_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: employee employee_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT employee_account_id_key UNIQUE (account_id);


--
-- Name: employee employee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT employee_pkey PRIMARY KEY (employee_id);


--
-- Name: feedback_attachment feedback_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_attachment
    ADD CONSTRAINT feedback_attachment_pkey PRIMARY KEY (attachment_id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (feedback_id);


--
-- Name: import_detail import_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_detail
    ADD CONSTRAINT import_detail_pkey PRIMARY KEY (detail_id);


--
-- Name: import_receipt import_receipt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_receipt
    ADD CONSTRAINT import_receipt_pkey PRIMARY KEY (receipt_id);


--
-- Name: interest interest_interest_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest
    ADD CONSTRAINT interest_interest_name_key UNIQUE (interest_name);


--
-- Name: interest interest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest
    ADD CONSTRAINT interest_pkey PRIMARY KEY (interest_id);


--
-- Name: loyalty_point_transaction loyalty_point_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_point_transaction
    ADD CONSTRAINT loyalty_point_transaction_pkey PRIMARY KEY (loyalty_transaction_id);


--
-- Name: order_detail order_detail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_detail
    ADD CONSTRAINT order_detail_pkey PRIMARY KEY (detail_id);


--
-- Name: order order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_pkey PRIMARY KEY (order_id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (event_id);


--
-- Name: payment payment_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_order_id_key UNIQUE (order_id);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (payment_id);


--
-- Name: permission permission_permission_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission
    ADD CONSTRAINT permission_permission_code_key UNIQUE (permission_code);


--
-- Name: permission permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permission
    ADD CONSTRAINT permission_pkey PRIMARY KEY (permission_id);


--
-- Name: product_image product_image_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image
    ADD CONSTRAINT product_image_pkey PRIMARY KEY (image_id);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (product_id);


--
-- Name: product_variant product_variant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_pkey PRIMARY KEY (variant_id);


--
-- Name: product_variant product_variant_product_id_size_id_color_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_product_id_size_id_color_id_key UNIQUE (product_id, size_id, color_id);


--
-- Name: product_variant product_variant_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_sku_key UNIQUE (sku);


--
-- Name: promotion promotion_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT promotion_code_key UNIQUE (code);


--
-- Name: promotion promotion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT promotion_pkey PRIMARY KEY (promotion_id);


--
-- Name: role_permission role_permission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (role_id);


--
-- Name: role role_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role
    ADD CONSTRAINT role_role_name_key UNIQUE (role_name);


--
-- Name: size size_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size
    ADD CONSTRAINT size_pkey PRIMARY KEY (size_id);


--
-- Name: size size_size_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.size
    ADD CONSTRAINT size_size_name_key UNIQUE (size_name);


--
-- Name: store_admin_schema_migrations store_admin_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_admin_schema_migrations
    ADD CONSTRAINT store_admin_schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (supplier_id);


--
-- Name: survey_answer survey_answer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answer
    ADD CONSTRAINT survey_answer_pkey PRIMARY KEY (answer_id);


--
-- Name: survey_invitation survey_invitation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_invitation
    ADD CONSTRAINT survey_invitation_pkey PRIMARY KEY (invitation_id);


--
-- Name: survey_invitation survey_invitation_survey_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_invitation
    ADD CONSTRAINT survey_invitation_survey_id_customer_id_key UNIQUE (survey_id, customer_id);


--
-- Name: survey_option survey_option_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_option
    ADD CONSTRAINT survey_option_pkey PRIMARY KEY (option_id);


--
-- Name: survey_option survey_option_question_option_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_option
    ADD CONSTRAINT survey_option_question_option_unique UNIQUE (question_id, option_id);


--
-- Name: survey survey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT survey_pkey PRIMARY KEY (survey_id);


--
-- Name: survey_question survey_question_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_question
    ADD CONSTRAINT survey_question_pkey PRIMARY KEY (question_id);


--
-- Name: survey_response survey_response_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_pkey PRIMARY KEY (response_id);


--
-- Name: survey_response survey_response_survey_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_survey_id_customer_id_key UNIQUE (survey_id, customer_id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_events user_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_events
    ADD CONSTRAINT user_events_pkey PRIMARY KEY (id);


--
-- Name: user_promotion user_promotion_customer_id_promotion_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_promotion
    ADD CONSTRAINT user_promotion_customer_id_promotion_id_key UNIQUE (customer_id, promotion_id);


--
-- Name: user_promotion user_promotion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_promotion
    ADD CONSTRAINT user_promotion_pkey PRIMARY KEY (user_promo_id);


--
-- Name: account_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_created_at_idx ON public.account USING btree (created_at DESC);


--
-- Name: account_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_email_idx ON public.account USING btree (email);


--
-- Name: account_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_role_idx ON public.account USING btree (role_id);


--
-- Name: account_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_status_idx ON public.account USING btree (status);


--
-- Name: account_username_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_username_lower_uidx ON public.account USING btree (lower((username)::text));


--
-- Name: brand_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand_active_idx ON public.brand USING btree (is_active);


--
-- Name: category_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX category_active_idx ON public.category USING btree (is_active);


--
-- Name: category_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX category_parent_idx ON public.category USING btree (parent_id);


--
-- Name: chat_message_attachment_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_message_attachment_message_idx ON public.chat_message_attachment USING btree (message_id, attachment_id);


--
-- Name: customer_dob_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_dob_idx ON public.customer USING btree (date_of_birth);


--
-- Name: customer_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_email_idx ON public.customer USING btree (email);


--
-- Name: customer_gender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_gender_idx ON public.customer USING btree (gender);


--
-- Name: customer_interest_cust_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interest_cust_idx ON public.customer_interest USING btree (customer_id);


--
-- Name: customer_interest_interest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_interest_interest_idx ON public.customer_interest USING btree (interest_id);


--
-- Name: customer_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_name_idx ON public.customer USING btree (full_name);


--
-- Name: customer_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_phone_idx ON public.customer USING btree (phone);


--
-- Name: customer_tier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_tier_idx ON public.customer USING btree (customer_tier);


--
-- Name: demo_payment_tokens_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX demo_payment_tokens_expiry_idx ON public.demo_payment_tokens USING btree (expires_at) WHERE (used_at IS NULL);


--
-- Name: employee_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_active_idx ON public.employee USING btree (is_active);


--
-- Name: employee_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_name_idx ON public.employee USING btree (full_name);


--
-- Name: feedback_attachment_feedback_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_attachment_feedback_idx ON public.feedback_attachment USING btree (feedback_id, attachment_id);


--
-- Name: feedback_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_created_at_idx ON public.feedback USING btree (created_at DESC);


--
-- Name: feedback_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_customer_idx ON public.feedback USING btree (customer_id);


--
-- Name: feedback_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_product_idx ON public.feedback USING btree (product_id);


--
-- Name: feedback_rating_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_rating_idx ON public.feedback USING btree (rating);


--
-- Name: feedback_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX feedback_status_idx ON public.feedback USING btree (status);


--
-- Name: idx_chat_message_conv_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_message_conv_id ON public.chat_message USING btree (conversation_id);


--
-- Name: idx_chat_message_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_message_sent_at ON public.chat_message USING btree (sent_at);


--
-- Name: idx_conversation_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_customer_id ON public.conversation USING btree (customer_id);


--
-- Name: idx_conversation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_status ON public.conversation USING btree (status);


--
-- Name: idx_conversation_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_updated_at ON public.conversation USING btree (updated_at DESC);


--
-- Name: import_detail_receipt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_detail_receipt_idx ON public.import_detail USING btree (receipt_id);


--
-- Name: import_detail_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX import_detail_variant_idx ON public.import_detail USING btree (variant_id);


--
-- Name: loyalty_point_transaction_customer_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loyalty_point_transaction_customer_created_idx ON public.loyalty_point_transaction USING btree (customer_id, created_at DESC, loyalty_transaction_id DESC);


--
-- Name: loyalty_point_transaction_order_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX loyalty_point_transaction_order_type_idx ON public.loyalty_point_transaction USING btree (order_id, transaction_type) WHERE (order_id IS NOT NULL);


--
-- Name: order_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_customer_idx ON public."order" USING btree (customer_id);


--
-- Name: order_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_date_idx ON public."order" USING btree (ordered_at DESC);


--
-- Name: order_detail_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_detail_order_idx ON public.order_detail USING btree (order_id);


--
-- Name: order_detail_variant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_detail_variant_idx ON public.order_detail USING btree (variant_id);


--
-- Name: order_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_employee_idx ON public."order" USING btree (employee_id);


--
-- Name: order_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_status_idx ON public."order" USING btree (order_status);


--
-- Name: outbox_events_unpublished_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX outbox_events_unpublished_idx ON public.outbox_events USING btree (created_at, event_id) WHERE (published_at IS NULL);


--
-- Name: payment_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_order_idx ON public.payment USING btree (order_id);


--
-- Name: payment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_status_idx ON public.payment USING btree (status);


--
-- Name: product_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_active_idx ON public.product USING btree (is_active);


--
-- Name: product_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_brand_idx ON public.product USING btree (brand_id);


--
-- Name: product_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_category_idx ON public.product USING btree (category_id);


--
-- Name: product_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_created_at_idx ON public.product USING btree (created_at DESC);


--
-- Name: product_image_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_image_product_idx ON public.product_image USING btree (product_id);


--
-- Name: product_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_name_idx ON public.product USING gin (to_tsvector('simple'::regconfig, (product_name)::text));


--
-- Name: product_price_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_price_idx ON public.product USING btree (selling_price);


--
-- Name: product_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_supplier_idx ON public.product USING btree (supplier_id);


--
-- Name: receipt_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipt_date_idx ON public.import_receipt USING btree (receipt_date DESC);


--
-- Name: receipt_employee_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipt_employee_idx ON public.import_receipt USING btree (employee_id);


--
-- Name: receipt_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX receipt_supplier_idx ON public.import_receipt USING btree (supplier_id);


--
-- Name: sa_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sa_question_idx ON public.survey_answer USING btree (question_id);


--
-- Name: sa_response_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sa_response_idx ON public.survey_answer USING btree (response_id);


--
-- Name: so_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX so_question_idx ON public.survey_option USING btree (question_id);


--
-- Name: sq_survey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sq_survey_idx ON public.survey_question USING btree (survey_id);


--
-- Name: sr_survey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sr_survey_idx ON public.survey_response USING btree (survey_id);


--
-- Name: supplier_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_active_idx ON public.supplier USING btree (is_active);


--
-- Name: supplier_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_name_idx ON public.supplier USING btree (supplier_name);


--
-- Name: survey_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_created_at_idx ON public.survey USING btree (created_at DESC);


--
-- Name: survey_invitation_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_invitation_customer_idx ON public.survey_invitation USING btree (customer_id);


--
-- Name: survey_invitation_survey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_invitation_survey_idx ON public.survey_invitation USING btree (survey_id);


--
-- Name: survey_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX survey_status_idx ON public.survey USING btree (status);


--
-- Name: transactions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_created_at_idx ON public.transactions USING btree (created_at DESC);


--
-- Name: transactions_event_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_event_id_unique_idx ON public.transactions USING btree (event_id);


--
-- Name: transactions_transaction_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_transaction_id_idx ON public.transactions USING btree (transaction_id);


--
-- Name: transactions_type_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_type_occurred_idx ON public.transactions USING btree (event_type, occurred_at DESC);


--
-- Name: user_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_events_created_at_idx ON public.user_events USING btree (created_at DESC);


--
-- Name: user_events_event_id_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_events_event_id_unique_idx ON public.user_events USING btree (event_id);


--
-- Name: user_events_type_occurred_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_events_type_occurred_idx ON public.user_events USING btree (event_type, occurred_at DESC);


--
-- Name: user_promo_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_promo_customer_idx ON public.user_promotion USING btree (customer_id);


--
-- Name: user_promo_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_promo_status_idx ON public.user_promotion USING btree (status);


--
-- Name: variant_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_active_idx ON public.product_variant USING btree (is_active);


--
-- Name: variant_color_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_color_idx ON public.product_variant USING btree (color_id);


--
-- Name: variant_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_product_idx ON public.product_variant USING btree (product_id);


--
-- Name: variant_size_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX variant_size_idx ON public.product_variant USING btree (size_id);


--
-- Name: account account_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(role_id);


--
-- Name: category category_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category
    ADD CONSTRAINT category_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.category(category_id);


--
-- Name: chat_message_attachment chat_message_attachment_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_attachment
    ADD CONSTRAINT chat_message_attachment_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_message(message_id) ON DELETE CASCADE;


--
-- Name: chat_message chat_message_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT chat_message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversation(conversation_id) ON DELETE CASCADE;


--
-- Name: chat_message chat_message_sender_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message
    ADD CONSTRAINT chat_message_sender_account_id_fkey FOREIGN KEY (sender_account_id) REFERENCES public.account(account_id) ON DELETE CASCADE;


--
-- Name: conversation conversation_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.employee(employee_id) ON DELETE SET NULL;


--
-- Name: conversation conversation_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation
    ADD CONSTRAINT conversation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE CASCADE;


--
-- Name: customer customer_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;


--
-- Name: customer_interest customer_interest_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interest
    ADD CONSTRAINT customer_interest_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE CASCADE;


--
-- Name: customer_interest customer_interest_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_interest
    ADD CONSTRAINT customer_interest_interest_id_fkey FOREIGN KEY (interest_id) REFERENCES public.interest(interest_id) ON DELETE CASCADE;


--
-- Name: demo_payment_tokens demo_payment_tokens_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demo_payment_tokens
    ADD CONSTRAINT demo_payment_tokens_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(order_id) ON DELETE CASCADE;


--
-- Name: employee employee_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee
    ADD CONSTRAINT employee_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(account_id) ON DELETE SET NULL;


--
-- Name: feedback_attachment feedback_attachment_feedback_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_attachment
    ADD CONSTRAINT feedback_attachment_feedback_id_fkey FOREIGN KEY (feedback_id) REFERENCES public.feedback(feedback_id) ON DELETE CASCADE;


--
-- Name: feedback feedback_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE SET NULL;


--
-- Name: feedback feedback_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id) ON DELETE SET NULL;


--
-- Name: feedback feedback_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(order_id) ON DELETE SET NULL;


--
-- Name: feedback feedback_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(product_id) ON DELETE SET NULL;


--
-- Name: import_detail import_detail_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_detail
    ADD CONSTRAINT import_detail_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES public.import_receipt(receipt_id) ON DELETE CASCADE;


--
-- Name: import_detail import_detail_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_detail
    ADD CONSTRAINT import_detail_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variant(variant_id);


--
-- Name: import_receipt import_receipt_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_receipt
    ADD CONSTRAINT import_receipt_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id);


--
-- Name: import_receipt import_receipt_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_receipt
    ADD CONSTRAINT import_receipt_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(supplier_id);


--
-- Name: loyalty_point_transaction loyalty_point_transaction_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_point_transaction
    ADD CONSTRAINT loyalty_point_transaction_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE CASCADE;


--
-- Name: loyalty_point_transaction loyalty_point_transaction_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_point_transaction
    ADD CONSTRAINT loyalty_point_transaction_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(order_id) ON DELETE SET NULL;


--
-- Name: order order_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE SET NULL;


--
-- Name: order_detail order_detail_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_detail
    ADD CONSTRAINT order_detail_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(order_id) ON DELETE CASCADE;


--
-- Name: order_detail order_detail_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_detail
    ADD CONSTRAINT order_detail_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variant(variant_id);


--
-- Name: order order_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employee(employee_id) ON DELETE SET NULL;


--
-- Name: order order_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."order"
    ADD CONSTRAINT order_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(promotion_id);


--
-- Name: payment payment_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_order_id_fkey FOREIGN KEY (order_id) REFERENCES public."order"(order_id) ON DELETE CASCADE;


--
-- Name: product product_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brand(brand_id);


--
-- Name: product product_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.category(category_id);


--
-- Name: product_image product_image_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_image
    ADD CONSTRAINT product_image_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(product_id) ON DELETE CASCADE;


--
-- Name: product product_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(supplier_id);


--
-- Name: product_variant product_variant_color_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_color_id_fkey FOREIGN KEY (color_id) REFERENCES public.color(color_id);


--
-- Name: product_variant product_variant_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(product_id) ON DELETE CASCADE;


--
-- Name: product_variant product_variant_size_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variant
    ADD CONSTRAINT product_variant_size_id_fkey FOREIGN KEY (size_id) REFERENCES public.size(size_id);


--
-- Name: promotion promotion_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotion
    ADD CONSTRAINT promotion_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employee(employee_id);


--
-- Name: role_permission role_permission_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permission(permission_id) ON DELETE CASCADE;


--
-- Name: role_permission role_permission_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permission
    ADD CONSTRAINT role_permission_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.role(role_id) ON DELETE CASCADE;


--
-- Name: survey_answer survey_answer_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answer
    ADD CONSTRAINT survey_answer_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.survey_option(option_id);


--
-- Name: survey_answer survey_answer_option_question_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answer
    ADD CONSTRAINT survey_answer_option_question_fk FOREIGN KEY (question_id, option_id) REFERENCES public.survey_option(question_id, option_id);


--
-- Name: survey_answer survey_answer_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answer
    ADD CONSTRAINT survey_answer_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_question(question_id);


--
-- Name: survey_answer survey_answer_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_answer
    ADD CONSTRAINT survey_answer_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.survey_response(response_id) ON DELETE CASCADE;


--
-- Name: survey survey_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT survey_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employee(employee_id) ON DELETE SET NULL;


--
-- Name: survey_invitation survey_invitation_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_invitation
    ADD CONSTRAINT survey_invitation_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE CASCADE;


--
-- Name: survey_invitation survey_invitation_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_invitation
    ADD CONSTRAINT survey_invitation_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.employee(employee_id) ON DELETE SET NULL;


--
-- Name: survey_invitation survey_invitation_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_invitation
    ADD CONSTRAINT survey_invitation_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(survey_id) ON DELETE CASCADE;


--
-- Name: survey_option survey_option_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_option
    ADD CONSTRAINT survey_option_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.survey_question(question_id) ON DELETE CASCADE;


--
-- Name: survey_question survey_question_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_question
    ADD CONSTRAINT survey_question_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(survey_id) ON DELETE CASCADE;


--
-- Name: survey_response survey_response_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE SET NULL;


--
-- Name: survey_response survey_response_survey_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey_response
    ADD CONSTRAINT survey_response_survey_id_fkey FOREIGN KEY (survey_id) REFERENCES public.survey(survey_id) ON DELETE CASCADE;


--
-- Name: survey survey_reward_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT survey_reward_promotion_id_fkey FOREIGN KEY (reward_promotion_id) REFERENCES public.promotion(promotion_id) ON DELETE SET NULL;


--
-- Name: survey survey_target_interest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.survey
    ADD CONSTRAINT survey_target_interest_id_fkey FOREIGN KEY (target_interest_id) REFERENCES public.interest(interest_id) ON DELETE SET NULL;


--
-- Name: user_promotion user_promotion_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_promotion
    ADD CONSTRAINT user_promotion_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(customer_id) ON DELETE CASCADE;


--
-- Name: user_promotion user_promotion_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_promotion
    ADD CONSTRAINT user_promotion_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotion(promotion_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict P9kuNYzPP3wRuEQfF7bB512mqeTU3LQQoSZq0R4EzueYIIzf5iyQRBxUO9uzXSu

