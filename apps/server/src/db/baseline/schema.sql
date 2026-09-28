--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_presentation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.action_presentation (
    id integer NOT NULL,
    action_type character varying(255) NOT NULL,
    kind character varying(255),
    scene_text text,
    cancel_label character varying(255) DEFAULT 'Stop'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: action_presentation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.action_presentation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: action_presentation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.action_presentation_id_seq OWNED BY public.action_presentation.id;


--
-- Name: animal_species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.animal_species (
    id integer NOT NULL,
    name character varying(60) NOT NULL,
    pen_type character varying(12) NOT NULL,
    husbandry_level integer DEFAULT 1 NOT NULL,
    grow_seconds integer NOT NULL,
    elder_seconds integer NOT NULL,
    baby_item_name character varying(60) NOT NULL,
    feed_item_name character varying(60),
    feed_qty integer DEFAULT 1 NOT NULL,
    product_item_name character varying(60),
    product_seconds integer,
    product_qty integer DEFAULT 1 NOT NULL,
    product_chance integer DEFAULT 100 NOT NULL,
    elder_yield_multiplier real DEFAULT '0.5'::real NOT NULL,
    elder_time_multiplier real DEFAULT '1.5'::real NOT NULL,
    slaughter_table text NOT NULL,
    mount_item_name character varying(60),
    xp_product integer DEFAULT 0 NOT NULL,
    xp_mature integer DEFAULT 0 NOT NULL,
    xp_slaughter integer DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    product_max_stored integer DEFAULT 4 NOT NULL,
    name_pool text,
    season_yield text,
    collect_text text,
    collect_empty_text text,
    elder_note text
);


--
-- Name: animal_species_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.animal_species_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: animal_species_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.animal_species_id_seq OWNED BY public.animal_species.id;


--
-- Name: bait_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bait_values (
    id integer NOT NULL,
    item_name character varying(80) NOT NULL,
    category character varying(20) NOT NULL,
    bait_value integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bait_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bait_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bait_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bait_values_id_seq OWNED BY public.bait_values.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    player_id integer NOT NULL,
    channel character varying(20) NOT NULL,
    region character varying(100),
    guild_id integer,
    message text NOT NULL,
    player_name character varying(100) NOT NULL,
    guild_tag character varying(20),
    sent_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: content_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_changes (
    id integer NOT NULL,
    player_id integer NOT NULL,
    table_name character varying(100) NOT NULL,
    row_id integer NOT NULL,
    column_name character varying(100) NOT NULL,
    old_value text,
    new_value text,
    reverts_change_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: content_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.content_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: content_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.content_changes_id_seq OWNED BY public.content_changes.id;


--
-- Name: crops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crops (
    id integer NOT NULL,
    name character varying(60) NOT NULL,
    seed_item_name character varying(60) NOT NULL,
    produce_item_name character varying(60) NOT NULL,
    plant_level integer DEFAULT 1 NOT NULL,
    grow_seconds integer NOT NULL,
    yield_per_seed integer DEFAULT 1 NOT NULL,
    xp_per_seed integer DEFAULT 1 NOT NULL,
    crop_type character varying(20) DEFAULT 'vegetable'::character varying NOT NULL,
    region character varying(100),
    grows_anywhere boolean,
    is_perennial boolean DEFAULT false NOT NULL,
    regrow_seconds integer,
    soil_effect character varying(12) DEFAULT 'deplete'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: crops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.crops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: crops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.crops_id_seq OWNED BY public.crops.id;


--
-- Name: drop_table_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drop_table_entries (
    id integer NOT NULL,
    source_key character varying(100) NOT NULL,
    item_id integer NOT NULL,
    chance_one_in integer DEFAULT 1 NOT NULL,
    min_qty integer DEFAULT 1 NOT NULL,
    max_qty integer DEFAULT 1 NOT NULL,
    discovery_xp integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    chance_percent numeric(6,3)
);


--
-- Name: drop_table_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drop_table_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: drop_table_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drop_table_entries_id_seq OWNED BY public.drop_table_entries.id;


--
-- Name: farm_plots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.farm_plots (
    id integer NOT NULL,
    property_id integer NOT NULL,
    slot_index integer NOT NULL,
    state character varying(12) DEFAULT 'empty'::character varying NOT NULL,
    soil_state character varying(12) DEFAULT 'normal'::character varying NOT NULL,
    crop_id integer,
    seed_count integer DEFAULT 0 NOT NULL,
    planted_at timestamp with time zone,
    ready_at timestamp with time zone,
    tended boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    rested_since timestamp with time zone,
    harvests_since_sow integer DEFAULT 0 NOT NULL
);


--
-- Name: farm_plots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.farm_plots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: farm_plots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.farm_plots_id_seq OWNED BY public.farm_plots.id;


--
-- Name: feats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feats (
    id integer NOT NULL,
    slug character varying(60) NOT NULL,
    name character varying(80) NOT NULL,
    description text NOT NULL,
    title character varying(60),
    criterion_kind character varying(20) NOT NULL,
    criterion_target character varying(60),
    criterion_value bigint NOT NULL,
    category character varying(40) NOT NULL,
    is_hidden boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    badge character varying(8),
    badge_key character varying(60)
);


--
-- Name: feats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feats_id_seq OWNED BY public.feats.id;


--
-- Name: fish_species; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fish_species (
    id integer NOT NULL,
    name character varying(80) NOT NULL,
    item_name character varying(80) NOT NULL,
    location_id integer NOT NULL,
    water character varying(10) NOT NULL,
    required_level integer DEFAULT 1 NOT NULL,
    base_weight integer DEFAULT 100 NOT NULL,
    bait_category character varying(20),
    time_window character varying(10),
    window_exclusive boolean DEFAULT false NOT NULL,
    seasons character varying(40),
    season_exclusive boolean DEFAULT false NOT NULL,
    min_weight_cw integer NOT NULL,
    max_weight_cw integer NOT NULL,
    xp integer NOT NULL,
    bait_value integer DEFAULT 1 NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kind character varying(10) DEFAULT 'fish'::character varying NOT NULL
);


--
-- Name: fish_species_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fish_species_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fish_species_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fish_species_id_seq OWNED BY public.fish_species.id;


--
-- Name: foraging_habitats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foraging_habitats (
    id integer NOT NULL,
    location_id integer NOT NULL,
    name character varying(80) NOT NULL,
    description character varying(400),
    required_level integer DEFAULT 1 NOT NULL,
    base_timer integer DEFAULT 6 NOT NULL,
    min_timer integer DEFAULT 3 NOT NULL,
    drop_table jsonb NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    scene_text character varying(300)
);


--
-- Name: foraging_habitats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.foraging_habitats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: foraging_habitats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.foraging_habitats_id_seq OWNED BY public.foraging_habitats.id;


--
-- Name: forum_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    staff_only boolean DEFAULT false,
    admin_post_only boolean DEFAULT false,
    auto_lock_days boolean DEFAULT false,
    lock_after_days integer,
    has_voting boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: forum_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_categories_id_seq OWNED BY public.forum_categories.id;


--
-- Name: forum_poll_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_poll_options (
    id integer NOT NULL,
    poll_id integer NOT NULL,
    option_text character varying(200) NOT NULL,
    vote_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: forum_poll_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_poll_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_poll_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_poll_options_id_seq OWNED BY public.forum_poll_options.id;


--
-- Name: forum_poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_poll_votes (
    id integer NOT NULL,
    poll_id integer NOT NULL,
    option_id integer NOT NULL,
    player_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: forum_poll_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_poll_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_poll_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_poll_votes_id_seq OWNED BY public.forum_poll_votes.id;


--
-- Name: forum_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_polls (
    id integer NOT NULL,
    thread_id integer NOT NULL,
    question character varying(300) NOT NULL,
    is_closed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: forum_polls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_polls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_polls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_polls_id_seq OWNED BY public.forum_polls.id;


--
-- Name: forum_post_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_post_votes (
    id integer NOT NULL,
    post_id integer NOT NULL,
    player_id integer NOT NULL,
    vote integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: forum_post_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_post_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_post_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_post_votes_id_seq OWNED BY public.forum_post_votes.id;


--
-- Name: forum_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_posts (
    id integer NOT NULL,
    thread_id integer NOT NULL,
    author_id integer NOT NULL,
    content text NOT NULL,
    is_deleted boolean DEFAULT false,
    is_first_post boolean DEFAULT false,
    upvotes integer DEFAULT 0,
    downvotes integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    edited_at timestamp with time zone
);


--
-- Name: forum_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_posts_id_seq OWNED BY public.forum_posts.id;


--
-- Name: forum_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.forum_threads (
    id integer NOT NULL,
    category_id integer NOT NULL,
    author_id integer NOT NULL,
    title character varying(200) NOT NULL,
    is_pinned boolean DEFAULT false,
    is_locked boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    locked_at timestamp with time zone,
    locked_reason character varying(200),
    reply_count integer DEFAULT 0,
    view_count integer DEFAULT 0,
    last_post_at timestamp with time zone,
    last_post_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: forum_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.forum_threads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: forum_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.forum_threads_id_seq OWNED BY public.forum_threads.id;


--
-- Name: gold_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gold_ledger (
    id integer NOT NULL,
    player_id integer NOT NULL,
    delta bigint NOT NULL,
    balance_after bigint NOT NULL,
    reason character varying(60) NOT NULL,
    ref_type character varying(40),
    ref_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: gold_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.gold_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: gold_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.gold_ledger_id_seq OWNED BY public.gold_ledger.id;


--
-- Name: ground_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ground_items (
    id integer NOT NULL,
    item_id integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    location_id integer NOT NULL,
    dropped_by_player_id integer,
    dropped_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    visible_to_all_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ground_items_quantity_nonnegative CHECK ((quantity >= 0))
);


--
-- Name: ground_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ground_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ground_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ground_items_id_seq OWNED BY public.ground_items.id;


--
-- Name: guild_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_applications (
    id integer NOT NULL,
    guild_id integer NOT NULL,
    player_id integer NOT NULL,
    message text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guild_applications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guild_applications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guild_applications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guild_applications_id_seq OWNED BY public.guild_applications.id;


--
-- Name: guild_forum_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_forum_categories (
    id integer NOT NULL,
    guild_id integer NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(300),
    sort_order integer DEFAULT 0 NOT NULL,
    min_role_view integer DEFAULT 1 NOT NULL,
    min_role_post integer DEFAULT 1 NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guild_forum_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guild_forum_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guild_forum_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guild_forum_categories_id_seq OWNED BY public.guild_forum_categories.id;


--
-- Name: guild_forum_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_forum_posts (
    id integer NOT NULL,
    guild_id integer NOT NULL,
    thread_id integer NOT NULL,
    author_id integer NOT NULL,
    content text NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    edited_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guild_forum_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guild_forum_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guild_forum_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guild_forum_posts_id_seq OWNED BY public.guild_forum_posts.id;


--
-- Name: guild_forum_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_forum_threads (
    id integer NOT NULL,
    guild_id integer NOT NULL,
    category_id integer NOT NULL,
    author_id integer NOT NULL,
    title character varying(200) NOT NULL,
    is_pinned boolean DEFAULT false NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    reply_count integer DEFAULT 0 NOT NULL,
    last_post_at timestamp with time zone,
    last_post_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guild_forum_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guild_forum_threads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guild_forum_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guild_forum_threads_id_seq OWNED BY public.guild_forum_threads.id;


--
-- Name: guild_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_invites (
    id integer NOT NULL,
    player_id integer NOT NULL,
    guild_id integer NOT NULL,
    invited_by integer NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT guild_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: guild_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guild_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guild_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guild_invites_id_seq OWNED BY public.guild_invites.id;


--
-- Name: guild_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guild_members (
    id integer NOT NULL,
    guild_id integer NOT NULL,
    player_id integer NOT NULL,
    role character varying(20) DEFAULT 'member'::character varying NOT NULL,
    joined_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: guild_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guild_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guild_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guild_members_id_seq OWNED BY public.guild_members.id;


--
-- Name: guilds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guilds (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    tag character varying(5) NOT NULL,
    founder_id integer NOT NULL,
    leader_id integer NOT NULL,
    description text,
    open_applications boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tag_last_changed timestamp with time zone,
    recruitment_message character varying(500),
    min_level_requirement integer DEFAULT 1 NOT NULL
);


--
-- Name: guilds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.guilds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: guilds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.guilds_id_seq OWNED BY public.guilds.id;


--
-- Name: huntable_animals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.huntable_animals (
    id integer NOT NULL,
    location_id integer NOT NULL,
    name character varying(100) NOT NULL,
    required_level integer DEFAULT 1 NOT NULL,
    base_timer integer NOT NULL,
    min_timer integer NOT NULL,
    base_catch_chance integer NOT NULL,
    xp_success integer NOT NULL,
    xp_failure integer NOT NULL,
    drop_table text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: huntable_animals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.huntable_animals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: huntable_animals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.huntable_animals_id_seq OWNED BY public.huntable_animals.id;


--
-- Name: item_firsts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_firsts (
    id integer NOT NULL,
    item_id integer NOT NULL,
    player_id integer NOT NULL,
    source character varying(40),
    announced boolean DEFAULT false NOT NULL,
    first_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: item_firsts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.item_firsts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: item_firsts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.item_firsts_id_seq OWNED BY public.item_firsts.id;


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(50) NOT NULL,
    subtype character varying(50),
    quality character varying(20),
    tier integer DEFAULT 1 NOT NULL,
    description text,
    icon character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    slot character varying(50),
    level_required integer DEFAULT 1 NOT NULL,
    travel_speed_modifier double precision DEFAULT 1.0 NOT NULL,
    agility_reduction real DEFAULT '0'::real NOT NULL,
    travel_time_override integer,
    travel_floor real,
    value integer,
    value_locked boolean DEFAULT false NOT NULL,
    heal_amount integer,
    buff_effect character varying(30),
    buff_skill character varying(50),
    buff_magnitude real,
    buff_seconds integer
);


--
-- Name: items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.items_id_seq OWNED BY public.items.id;


--
-- Name: kiln_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kiln_jobs (
    id integer NOT NULL,
    player_id integer NOT NULL,
    location_id integer NOT NULL,
    logs_added integer NOT NULL,
    charc_yield integer NOT NULL,
    xp_reward integer NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ready_at timestamp with time zone NOT NULL,
    is_collected boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: kiln_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kiln_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kiln_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kiln_jobs_id_seq OWNED BY public.kiln_jobs.id;


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: location_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_connections (
    id integer NOT NULL,
    from_location_id integer NOT NULL,
    to_location_id integer NOT NULL,
    base_travel_time integer NOT NULL,
    travel_type character varying(50) DEFAULT 'walking'::character varying NOT NULL,
    required_skill character varying(50),
    required_level integer,
    is_bidirectional boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: location_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.location_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: location_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.location_connections_id_seq OWNED BY public.location_connections.id;


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    region character varying(100),
    type character varying(50) NOT NULL,
    description text,
    map_x integer DEFAULT 0 NOT NULL,
    map_y integer DEFAULT 0 NOT NULL,
    is_safe boolean DEFAULT true,
    is_accessible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.locations_id_seq OWNED BY public.locations.id;


--
-- Name: loot_log_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loot_log_entries (
    id integer NOT NULL,
    source_id integer NOT NULL,
    kind character varying(8) NOT NULL,
    name character varying(80) NOT NULL,
    amount bigint DEFAULT '0'::bigint NOT NULL,
    first_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: loot_log_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loot_log_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loot_log_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loot_log_entries_id_seq OWNED BY public.loot_log_entries.id;


--
-- Name: loot_log_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loot_log_sources (
    id integer NOT NULL,
    player_id integer NOT NULL,
    source character varying(120) NOT NULL,
    actions bigint DEFAULT '0'::bigint NOT NULL,
    first_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: loot_log_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loot_log_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loot_log_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loot_log_sources_id_seq OWNED BY public.loot_log_sources.id;


--
-- Name: manual_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_pages (
    id integer NOT NULL,
    section character varying(64) NOT NULL,
    slug character varying(128) NOT NULL,
    title character varying(200),
    blurb character varying(500),
    content text DEFAULT ''::text NOT NULL,
    sort_order integer,
    is_published boolean DEFAULT true NOT NULL,
    updated_by integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: manual_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.manual_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: manual_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.manual_pages_id_seq OWNED BY public.manual_pages.id;


--
-- Name: merchant_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_stock (
    id integer NOT NULL,
    merchant_id integer NOT NULL,
    item_id integer NOT NULL,
    is_core boolean DEFAULT false NOT NULL,
    min_qty integer DEFAULT 3 NOT NULL,
    max_qty integer DEFAULT 7 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: merchant_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.merchant_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: merchant_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.merchant_stock_id_seq OWNED BY public.merchant_stock.id;


--
-- Name: merchants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchants (
    id integer NOT NULL,
    key character varying(40) NOT NULL,
    name character varying(80) NOT NULL,
    title character varying(80),
    greeting text,
    location_id integer NOT NULL,
    buy_rate numeric(4,3) DEFAULT 0.45 NOT NULL,
    buys_anything boolean DEFAULT false NOT NULL,
    sells boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: merchants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.merchants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: merchants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.merchants_id_seq OWNED BY public.merchants.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    sender_id integer,
    recipient_id integer NOT NULL,
    sender_name character varying(100) NOT NULL,
    subject character varying(200) DEFAULT '(No Subject)'::character varying NOT NULL,
    body text NOT NULL,
    is_read boolean DEFAULT false,
    is_system boolean DEFAULT false,
    reply_to_id integer,
    sent_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: mod_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mod_permissions (
    id integer NOT NULL,
    player_id integer NOT NULL,
    can_moderate_chat boolean DEFAULT false,
    can_moderate_forum boolean DEFAULT false,
    can_view_players boolean DEFAULT false,
    can_send_messages boolean DEFAULT false,
    can_ban boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: mod_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mod_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mod_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mod_permissions_id_seq OWNED BY public.mod_permissions.id;


--
-- Name: mutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mutes (
    id integer NOT NULL,
    player_id integer NOT NULL,
    issued_by integer NOT NULL,
    type character varying(20) NOT NULL,
    reason character varying(500),
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: mutes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mutes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mutes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mutes_id_seq OWNED BY public.mutes.id;


--
-- Name: news_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_posts (
    id integer NOT NULL,
    author_id integer NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    forum_thread_id integer,
    published_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: news_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.news_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: news_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.news_posts_id_seq OWNED BY public.news_posts.id;


--
-- Name: npc_dialogues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npc_dialogues (
    id integer NOT NULL,
    npc_id integer NOT NULL,
    stage_key character varying(50) NOT NULL,
    text_lines text[] NOT NULL,
    options jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: npc_dialogues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.npc_dialogues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: npc_dialogues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.npc_dialogues_id_seq OWNED BY public.npc_dialogues.id;


--
-- Name: npc_purchase_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npc_purchase_daily (
    id integer NOT NULL,
    player_id integer NOT NULL,
    item_id integer NOT NULL,
    purchase_date character varying(10) NOT NULL,
    units_bought integer DEFAULT 0 NOT NULL
);


--
-- Name: npc_purchase_daily_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.npc_purchase_daily_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: npc_purchase_daily_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.npc_purchase_daily_id_seq OWNED BY public.npc_purchase_daily.id;


--
-- Name: npc_sale_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npc_sale_daily (
    id integer NOT NULL,
    player_id integer NOT NULL,
    item_id integer NOT NULL,
    sale_date character varying(10) NOT NULL,
    units_sold integer DEFAULT 0 NOT NULL
);


--
-- Name: npc_sale_daily_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.npc_sale_daily_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: npc_sale_daily_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.npc_sale_daily_id_seq OWNED BY public.npc_sale_daily.id;


--
-- Name: npcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npcs (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    title character varying(150),
    location_id integer NOT NULL,
    submenu character varying(50),
    avatar character varying(10),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    hide_after_quest_id integer
);


--
-- Name: npcs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.npcs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: npcs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.npcs_id_seq OWNED BY public.npcs.id;


--
-- Name: ore_veins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ore_veins (
    id integer NOT NULL,
    location_id integer NOT NULL,
    ore_item_id integer NOT NULL,
    total_quantity integer NOT NULL,
    remaining_quantity integer NOT NULL,
    discovered_by_player_id integer,
    discovered_at timestamp with time zone,
    announced_at timestamp with time zone,
    is_announced boolean DEFAULT false,
    is_dense boolean DEFAULT false,
    is_depleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ore_veins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ore_veins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ore_veins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ore_veins_id_seq OWNED BY public.ore_veins.id;


--
-- Name: pen_flowers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pen_flowers (
    id integer NOT NULL,
    pen_id integer NOT NULL,
    slot_index integer NOT NULL,
    item_name character varying(100) NOT NULL,
    planted_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pen_flowers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pen_flowers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pen_flowers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pen_flowers_id_seq OWNED BY public.pen_flowers.id;


--
-- Name: player_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_actions (
    id integer NOT NULL,
    player_id integer NOT NULL,
    action_type character varying(50) NOT NULL,
    resource_node_id integer,
    location_id integer,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completes_at timestamp with time zone NOT NULL,
    auto_restart boolean DEFAULT true,
    last_bot_check timestamp with time zone,
    bot_check_pending boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    action_data character varying(100),
    action_limit integer,
    actions_completed integer DEFAULT 0,
    using_blacksmith boolean DEFAULT false,
    bot_check_answer integer,
    last_timer_seconds integer
);


--
-- Name: player_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_actions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_actions_id_seq OWNED BY public.player_actions.id;


--
-- Name: player_animals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_animals (
    id integer NOT NULL,
    player_id integer NOT NULL,
    pen_id integer NOT NULL,
    species_id integer NOT NULL,
    name character varying(40) NOT NULL,
    grow_seconds_accrued integer DEFAULT 0 NOT NULL,
    product_seconds_accrued integer DEFAULT 0 NOT NULL,
    accrued_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mature_xp_paid boolean DEFAULT false NOT NULL,
    born_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_animals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_animals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_animals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_animals_id_seq OWNED BY public.player_animals.id;


--
-- Name: player_bait; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_bait (
    id integer NOT NULL,
    player_id integer NOT NULL,
    category character varying(20) NOT NULL,
    amount integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_bait_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_bait_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_bait_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_bait_id_seq OWNED BY public.player_bait.id;


--
-- Name: player_buffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_buffs (
    id integer NOT NULL,
    player_id integer NOT NULL,
    source_item character varying(100) NOT NULL,
    effect_type character varying(30) NOT NULL,
    skill character varying(50),
    magnitude real NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_buffs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_buffs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_buffs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_buffs_id_seq OWNED BY public.player_buffs.id;


--
-- Name: player_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_equipment (
    id integer NOT NULL,
    player_id integer NOT NULL,
    head_item_id integer,
    neck_item_id integer,
    back_item_id integer,
    chest_item_id integer,
    mainhand_item_id integer,
    offhand_item_id integer,
    legs_item_id integer,
    hands_item_id integer,
    feet_item_id integer,
    finger_item_id integer,
    mount_item_id integer,
    trophy_item_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_equipment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_equipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_equipment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_equipment_id_seq OWNED BY public.player_equipment.id;


--
-- Name: player_exploration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_exploration (
    id integer NOT NULL,
    player_id integer NOT NULL,
    discovery_type character varying(50) NOT NULL,
    discovery_key character varying(255) NOT NULL,
    xp_awarded integer DEFAULT 0 NOT NULL,
    discovered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: player_exploration_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_exploration_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_exploration_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_exploration_id_seq OWNED BY public.player_exploration.id;


--
-- Name: player_feats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_feats (
    id integer NOT NULL,
    player_id integer NOT NULL,
    feat_id integer NOT NULL,
    earned_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_feats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_feats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_feats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_feats_id_seq OWNED BY public.player_feats.id;


--
-- Name: player_fishing_discoveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_fishing_discoveries (
    id integer NOT NULL,
    player_id integer NOT NULL,
    species character varying(80) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_fishing_discoveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_fishing_discoveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_fishing_discoveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_fishing_discoveries_id_seq OWNED BY public.player_fishing_discoveries.id;


--
-- Name: player_fishing_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_fishing_records (
    id integer NOT NULL,
    player_id integer NOT NULL,
    species character varying(80) NOT NULL,
    heaviest_cw integer NOT NULL,
    lightest_cw integer NOT NULL,
    catches integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_fishing_records_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_fishing_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_fishing_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_fishing_records_id_seq OWNED BY public.player_fishing_records.id;


--
-- Name: player_foraging_discoveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_foraging_discoveries (
    id integer NOT NULL,
    player_id integer NOT NULL,
    habitat_id integer NOT NULL,
    item_name character varying(80) NOT NULL,
    discovered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_foraging_discoveries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_foraging_discoveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_foraging_discoveries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_foraging_discoveries_id_seq OWNED BY public.player_foraging_discoveries.id;


--
-- Name: player_hints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_hints (
    id integer NOT NULL,
    player_id integer NOT NULL,
    hint_key character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_hints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_hints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_hints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_hints_id_seq OWNED BY public.player_hints.id;


--
-- Name: player_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_inventory (
    id integer NOT NULL,
    player_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT player_inventory_quantity_nonnegative CHECK ((quantity >= 0))
);


--
-- Name: player_inventory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_inventory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_inventory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_inventory_id_seq OWNED BY public.player_inventory.id;


--
-- Name: player_item_firsts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_item_firsts (
    id integer NOT NULL,
    player_id integer NOT NULL,
    item_id integer NOT NULL,
    source character varying(40),
    first_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_item_firsts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_item_firsts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_item_firsts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_item_firsts_id_seq OWNED BY public.player_item_firsts.id;


--
-- Name: player_liquids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_liquids (
    id integer NOT NULL,
    player_id integer NOT NULL,
    liquid character varying(60) NOT NULL,
    units integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_liquids_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_liquids_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_liquids_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_liquids_id_seq OWNED BY public.player_liquids.id;


--
-- Name: player_palettes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_palettes (
    id integer NOT NULL,
    player_id integer NOT NULL,
    name character varying(40) NOT NULL,
    tokens jsonb NOT NULL,
    is_shared boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_palettes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_palettes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_palettes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_palettes_id_seq OWNED BY public.player_palettes.id;


--
-- Name: player_pens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_pens (
    id integer NOT NULL,
    property_id integer NOT NULL,
    slot_index integer NOT NULL,
    pen_type character varying(12) NOT NULL,
    species_id integer,
    capacity integer DEFAULT 4 NOT NULL,
    fed_until timestamp with time zone,
    muck_due_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_pens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_pens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_pens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_pens_id_seq OWNED BY public.player_pens.id;


--
-- Name: player_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_properties (
    id integer NOT NULL,
    player_id integer NOT NULL,
    location_id integer NOT NULL,
    type character varying(30) NOT NULL,
    tier integer DEFAULT 1 NOT NULL,
    plot_slots integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    storage_slots integer DEFAULT 50 NOT NULL,
    pen_slots integer DEFAULT 0 NOT NULL,
    apiary_slots integer DEFAULT 0 NOT NULL
);


--
-- Name: player_properties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_properties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_properties_id_seq OWNED BY public.player_properties.id;


--
-- Name: player_quest_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_quest_objectives (
    id integer NOT NULL,
    player_id integer NOT NULL,
    objective_id integer NOT NULL,
    current_amount integer DEFAULT 0 NOT NULL,
    is_complete boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_quest_objectives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_quest_objectives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_quest_objectives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_quest_objectives_id_seq OWNED BY public.player_quest_objectives.id;


--
-- Name: player_quests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_quests (
    id integer NOT NULL,
    player_id integer NOT NULL,
    quest_id integer NOT NULL,
    status text DEFAULT 'active'::text,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT player_quests_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])))
);


--
-- Name: player_quests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_quests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_quests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_quests_id_seq OWNED BY public.player_quests.id;


--
-- Name: player_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_settings (
    id integer NOT NULL,
    player_id integer NOT NULL,
    muted_channels text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    show_travel_log boolean DEFAULT true NOT NULL,
    theme character varying(40) DEFAULT 'tavern'::character varying NOT NULL,
    show_item_animation boolean DEFAULT true NOT NULL,
    hide_tally_when_built boolean DEFAULT false NOT NULL,
    manual_reference_mode boolean DEFAULT false NOT NULL
);


--
-- Name: player_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_settings_id_seq OWNED BY public.player_settings.id;


--
-- Name: player_shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_shops (
    id integer NOT NULL,
    property_id integer NOT NULL,
    name character varying(60) NOT NULL,
    description text,
    sell_slots integer DEFAULT 12 NOT NULL,
    buy_slots integer DEFAULT 6 NOT NULL,
    till_gold bigint DEFAULT '0'::bigint NOT NULL,
    buy_fund_gold bigint DEFAULT '0'::bigint NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tagline character varying(80),
    last_seen_at timestamp with time zone,
    last_notified_at timestamp with time zone,
    CONSTRAINT player_shops_buy_fund_nonnegative CHECK ((buy_fund_gold >= 0)),
    CONSTRAINT player_shops_till_nonnegative CHECK ((till_gold >= 0))
);


--
-- Name: player_shops_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_shops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_shops_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_shops_id_seq OWNED BY public.player_shops.id;


--
-- Name: player_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_skills (
    id integer NOT NULL,
    player_id integer NOT NULL,
    skill_id integer NOT NULL,
    xp bigint DEFAULT '0'::bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: player_skills_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_skills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_skills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_skills_id_seq OWNED BY public.player_skills.id;


--
-- Name: player_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_stats (
    id integer NOT NULL,
    player_id integer NOT NULL,
    total_logs_chopped bigint DEFAULT '0'::bigint,
    poor_logs_chopped bigint DEFAULT '0'::bigint,
    fine_logs_chopped bigint DEFAULT '0'::bigint,
    excellent_logs_chopped bigint DEFAULT '0'::bigint,
    lanai_logs_chopped bigint DEFAULT '0'::bigint,
    hatch_logs_chopped bigint DEFAULT '0'::bigint,
    bearn_logs_chopped bigint DEFAULT '0'::bigint,
    mirrith_logs_chopped bigint DEFAULT '0'::bigint,
    craxial_logs_chopped bigint DEFAULT '0'::bigint,
    total_rocks_mined bigint DEFAULT '0'::bigint,
    total_ores_mined bigint DEFAULT '0'::bigint,
    total_dense_ores_mined bigint DEFAULT '0'::bigint,
    veins_discovered bigint DEFAULT '0'::bigint,
    ambren_ore_mined bigint DEFAULT '0'::bigint,
    burgh_ore_mined bigint DEFAULT '0'::bigint,
    serph_ore_mined bigint DEFAULT '0'::bigint,
    total_locations_visited bigint DEFAULT '0'::bigint,
    total_distance_traveled bigint DEFAULT '0'::bigint,
    total_actions_completed bigint DEFAULT '0'::bigint,
    total_xp_earned bigint DEFAULT '0'::bigint,
    bot_checks_passed bigint DEFAULT '0'::bigint,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    total_items_foraged integer DEFAULT 0 NOT NULL,
    total_animals_hunted bigint DEFAULT '0'::bigint,
    total_fish_caught bigint DEFAULT '0'::bigint,
    total_plots_tilled bigint DEFAULT '0'::bigint NOT NULL,
    total_seeds_sown bigint DEFAULT '0'::bigint NOT NULL,
    total_crops_harvested bigint DEFAULT '0'::bigint NOT NULL,
    total_animals_raised bigint DEFAULT '0'::bigint NOT NULL,
    total_animal_products bigint DEFAULT '0'::bigint NOT NULL,
    total_animals_slaughtered bigint DEFAULT '0'::bigint NOT NULL,
    total_pens_mucked bigint DEFAULT '0'::bigint NOT NULL,
    total_ingots_smelted bigint DEFAULT '0'::bigint NOT NULL,
    total_items_forged bigint DEFAULT '0'::bigint NOT NULL,
    total_planks_sawn bigint DEFAULT '0'::bigint NOT NULL,
    total_items_built bigint DEFAULT '0'::bigint NOT NULL,
    total_items_crafted bigint DEFAULT '0'::bigint NOT NULL,
    total_meals_cooked bigint DEFAULT '0'::bigint NOT NULL,
    total_meals_burnt bigint DEFAULT '0'::bigint NOT NULL,
    total_habitats_searched bigint DEFAULT '0'::bigint NOT NULL,
    total_journeys_on_foot bigint DEFAULT '0'::bigint NOT NULL,
    total_journeys_mounted bigint DEFAULT '0'::bigint NOT NULL
);


--
-- Name: player_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_stats_id_seq OWNED BY public.player_stats.id;


--
-- Name: player_traps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_traps (
    id integer NOT NULL,
    player_id integer NOT NULL,
    trap_type_id integer NOT NULL,
    location_id integer NOT NULL,
    bait_item_id integer,
    state character varying(20) DEFAULT 'set'::character varying NOT NULL,
    caught_target_id integer,
    caught_at timestamp with time zone,
    next_roll_at timestamp with time zone NOT NULL,
    last_scavenge_check timestamp with time zone,
    placed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bait_category character varying(20)
);


--
-- Name: player_traps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_traps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_traps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_traps_id_seq OWNED BY public.player_traps.id;


--
-- Name: player_unlocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_unlocks (
    id integer NOT NULL,
    player_id integer NOT NULL,
    unlock_key character varying(80) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: player_unlocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_unlocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_unlocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_unlocks_id_seq OWNED BY public.player_unlocks.id;


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    id integer NOT NULL,
    username character varying(32) NOT NULL,
    email character varying(255),
    password_hash character varying(255),
    reset_token character varying(255),
    reset_token_expires timestamp with time zone,
    is_banned boolean DEFAULT false,
    is_admin boolean DEFAULT false,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    current_location_id integer,
    first_login boolean DEFAULT true,
    has_seen_welcome boolean DEFAULT false,
    guild_id integer,
    guild_tag character varying(5),
    guild_role character varying(20),
    last_seen timestamp with time zone,
    avatar_url character varying(500),
    forum_signature character varying(300),
    forum_post_count integer DEFAULT 0,
    is_mod boolean DEFAULT false,
    strike_count integer DEFAULT 0,
    is_chat_muted boolean DEFAULT false,
    chat_muted_until timestamp with time zone,
    is_forum_banned boolean DEFAULT false,
    forum_banned_until timestamp with time zone,
    banned_until timestamp with time zone,
    ban_reason character varying(500),
    last_bot_check timestamp with time zone,
    bot_check_answer integer,
    total_seconds_played bigint DEFAULT '0'::bigint NOT NULL,
    loot_reset_at timestamp with time zone,
    gold bigint DEFAULT '0'::bigint NOT NULL,
    failed_bot_checks integer DEFAULT 0 NOT NULL,
    is_guest boolean DEFAULT false NOT NULL,
    guest_expires_at timestamp with time zone,
    email_verified_at timestamp with time zone,
    was_guest boolean DEFAULT false NOT NULL,
    tally_licences integer DEFAULT 1 NOT NULL,
    worn_title character varying(60),
    worn_badge character varying(60),
    token_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT players_gold_nonnegative CHECK ((gold >= 0))
);


--
-- Name: players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.players_id_seq OWNED BY public.players.id;


--
-- Name: property_storage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.property_storage (
    id integer NOT NULL,
    property_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity bigint DEFAULT '0'::bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT property_storage_quantity_nonnegative CHECK ((quantity >= 0))
);


--
-- Name: property_storage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.property_storage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: property_storage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.property_storage_id_seq OWNED BY public.property_storage.id;


--
-- Name: quest_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quest_objectives (
    id integer NOT NULL,
    quest_id integer NOT NULL,
    "order" integer DEFAULT 1 NOT NULL,
    description character varying(255) NOT NULL,
    type character varying(50) NOT NULL,
    target_item character varying(100),
    required_amount integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: quest_objectives_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quest_objectives_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quest_objectives_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quest_objectives_id_seq OWNED BY public.quest_objectives.id;


--
-- Name: quests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quests (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text NOT NULL,
    skill character varying(255),
    npc_name character varying(100) NOT NULL,
    location_id integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    start_items text,
    reward_items text,
    reward_xp integer,
    reward_gold integer DEFAULT 0 NOT NULL
);


--
-- Name: quests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quests_id_seq OWNED BY public.quests.id;


--
-- Name: recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipes (
    id integer NOT NULL,
    skill character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    output_item_name character varying(100) NOT NULL,
    output_qty integer DEFAULT 1 NOT NULL,
    inputs text NOT NULL,
    required_level integer DEFAULT 1 NOT NULL,
    timer_seconds integer NOT NULL,
    xp integer NOT NULL,
    station character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    mode character varying(20) DEFAULT 'active'::character varying NOT NULL,
    for_skill character varying(50),
    flavor_text character varying(200),
    byproduct_item_name character varying(60),
    byproduct_qty integer DEFAULT 0 NOT NULL,
    required_tools text,
    burn_base real,
    burn_stop integer
);


--
-- Name: recipes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recipes_id_seq OWNED BY public.recipes.id;


--
-- Name: resource_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_nodes (
    id integer NOT NULL,
    location_id integer NOT NULL,
    skill character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    required_level integer DEFAULT 1 NOT NULL,
    base_timer integer NOT NULL,
    min_timer integer NOT NULL,
    required_tool_tier integer DEFAULT 1 NOT NULL,
    poor_chance integer DEFAULT 60 NOT NULL,
    fine_chance integer DEFAULT 35 NOT NULL,
    excellent_chance integer DEFAULT 5 NOT NULL,
    xp_reward integer DEFAULT 10 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    vein_discovery_chance integer,
    min_vein_quantity integer,
    max_vein_quantity integer,
    ore_subtype character varying(50)
);


--
-- Name: resource_nodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resource_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resource_nodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resource_nodes_id_seq OWNED BY public.resource_nodes.id;


--
-- Name: shop_buy_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_buy_orders (
    id integer NOT NULL,
    shop_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity_wanted bigint NOT NULL,
    quantity_filled bigint DEFAULT '0'::bigint NOT NULL,
    unit_price integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT shop_buy_orders_filled_within_wanted CHECK (((quantity_filled >= 0) AND (quantity_filled <= quantity_wanted)))
);


--
-- Name: shop_buy_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_buy_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_buy_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_buy_orders_id_seq OWNED BY public.shop_buy_orders.id;


--
-- Name: shop_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_listings (
    id integer NOT NULL,
    shop_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity bigint DEFAULT '0'::bigint NOT NULL,
    unit_price integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT shop_listings_quantity_nonnegative CHECK ((quantity >= 0))
);


--
-- Name: shop_listings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_listings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_listings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_listings_id_seq OWNED BY public.shop_listings.id;


--
-- Name: shop_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shop_transactions (
    id integer NOT NULL,
    shop_id integer NOT NULL,
    item_id integer NOT NULL,
    direction character varying(10) NOT NULL,
    quantity bigint NOT NULL,
    unit_price integer NOT NULL,
    gross bigint NOT NULL,
    tax bigint DEFAULT '0'::bigint NOT NULL,
    counterparty_player_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: shop_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shop_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shop_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shop_transactions_id_seq OWNED BY public.shop_transactions.id;


--
-- Name: skill_milestone_firsts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_milestone_firsts (
    id integer NOT NULL,
    skill_name character varying(60) NOT NULL,
    level integer NOT NULL,
    player_id integer NOT NULL,
    achieved_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: skill_milestone_firsts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skill_milestone_firsts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skill_milestone_firsts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skill_milestone_firsts_id_seq OWNED BY public.skill_milestone_firsts.id;


--
-- Name: skill_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skill_snapshots (
    id integer NOT NULL,
    player_id integer NOT NULL,
    skill_id integer NOT NULL,
    xp_at_snapshot bigint DEFAULT '0'::bigint NOT NULL,
    snapshot_date timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: skill_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skill_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skill_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skill_snapshots_id_seq OWNED BY public.skill_snapshots.id;


--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    type character varying(50) NOT NULL,
    description text,
    icon character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_implemented boolean DEFAULT false NOT NULL
);


--
-- Name: skills_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skills_id_seq OWNED BY public.skills.id;


--
-- Name: taler_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taler_adjustments (
    id integer NOT NULL,
    paddle_adjustment_id character varying(64) NOT NULL,
    purchase_id integer NOT NULL,
    player_id integer NOT NULL,
    action character varying(40) NOT NULL,
    talers integer NOT NULL,
    subtotal_minor bigint,
    currency_code character varying(3),
    outcome character varying(20) NOT NULL,
    balance_after integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: taler_adjustments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taler_adjustments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taler_adjustments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taler_adjustments_id_seq OWNED BY public.taler_adjustments.id;


--
-- Name: taler_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taler_ledger (
    id integer NOT NULL,
    player_id integer NOT NULL,
    delta integer NOT NULL,
    reason character varying(60) NOT NULL,
    ref_type character varying(40),
    ref_id integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: taler_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taler_ledger_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taler_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taler_ledger_id_seq OWNED BY public.taler_ledger.id;


--
-- Name: taler_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.taler_purchases (
    id integer NOT NULL,
    player_id integer NOT NULL,
    paddle_transaction_id character varying(100) NOT NULL,
    usd_cents integer NOT NULL,
    talers integer NOT NULL,
    buyer_country character varying(8),
    status character varying(30) DEFAULT 'completed'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    currency_code character varying(3),
    subtotal_minor bigint
);


--
-- Name: taler_purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.taler_purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: taler_purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.taler_purchases_id_seq OWNED BY public.taler_purchases.id;


--
-- Name: tally_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tally_boards (
    id integer NOT NULL,
    player_id integer NOT NULL,
    location_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tally_boards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tally_boards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tally_boards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tally_boards_id_seq OWNED BY public.tally_boards.id;


--
-- Name: tanning_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tanning_jobs (
    id integer NOT NULL,
    player_id integer NOT NULL,
    location_id integer NOT NULL,
    recipe_id integer NOT NULL,
    hide_count integer NOT NULL,
    buckskin_yield integer NOT NULL,
    xp_reward integer NOT NULL,
    started_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ready_at timestamp with time zone NOT NULL,
    is_collected boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: tanning_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tanning_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tanning_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tanning_jobs_id_seq OWNED BY public.tanning_jobs.id;


--
-- Name: trade_gold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_gold (
    id integer NOT NULL,
    trade_id integer NOT NULL,
    player_id integer NOT NULL,
    gold_amount integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT trade_gold_amount_nonnegative CHECK ((gold_amount >= 0))
);


--
-- Name: trade_gold_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trade_gold_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trade_gold_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trade_gold_id_seq OWNED BY public.trade_gold.id;


--
-- Name: trade_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trade_offers (
    id integer NOT NULL,
    trade_id integer NOT NULL,
    player_id integer NOT NULL,
    item_id integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT trade_offers_quantity_nonnegative CHECK ((quantity >= 0))
);


--
-- Name: trade_offers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trade_offers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trade_offers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trade_offers_id_seq OWNED BY public.trade_offers.id;


--
-- Name: trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trades (
    id integer NOT NULL,
    player1_id integer NOT NULL,
    player2_id integer NOT NULL,
    location_id integer NOT NULL,
    status text DEFAULT 'pending'::text,
    player1_accepted boolean DEFAULT false,
    player2_accepted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    offer_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT trades_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: trades_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trades_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trades_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trades_id_seq OWNED BY public.trades.id;


--
-- Name: trap_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trap_targets (
    id integer NOT NULL,
    location_id integer NOT NULL,
    trap_type_id integer,
    name character varying(100) NOT NULL,
    weight integer NOT NULL,
    xp integer NOT NULL,
    drop_table text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    flavor_text text,
    bait_category character varying(20)
);


--
-- Name: trap_targets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trap_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trap_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trap_targets_id_seq OWNED BY public.trap_targets.id;


--
-- Name: trap_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trap_types (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    item_name character varying(100) NOT NULL,
    required_level integer NOT NULL,
    roll_interval_seconds integer NOT NULL,
    catch_chance integer NOT NULL,
    break_chance integer NOT NULL,
    scavenger_safe_hours integer NOT NULL,
    scavenger_hourly_chance integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: trap_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trap_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trap_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trap_types_id_seq OWNED BY public.trap_types.id;


--
-- Name: travel_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_log (
    id integer NOT NULL,
    player_id integer NOT NULL,
    from_location character varying(255) NOT NULL,
    to_location character varying(255) NOT NULL,
    skill_name character varying(255) NOT NULL,
    events text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: travel_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.travel_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: travel_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.travel_log_id_seq OWNED BY public.travel_log.id;


--
-- Name: warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warnings (
    id integer NOT NULL,
    player_id integer NOT NULL,
    issued_by integer NOT NULL,
    reason character varying(500) NOT NULL,
    type character varying(20) DEFAULT 'formal'::character varying NOT NULL,
    strike_number integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: warnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warnings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warnings_id_seq OWNED BY public.warnings.id;


--
-- Name: workstation_slot_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workstation_slot_types (
    id integer NOT NULL,
    station_type character varying(50) NOT NULL,
    slot character varying(50) NOT NULL,
    label character varying(60) NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    accepts_subtype character varying(50),
    accepts_names text,
    is_required boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: workstation_slot_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workstation_slot_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workstation_slot_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workstation_slot_types_id_seq OWNED BY public.workstation_slot_types.id;


--
-- Name: workstation_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workstation_slots (
    id integer NOT NULL,
    workstation_id integer NOT NULL,
    slot character varying(50) NOT NULL,
    slot_index integer DEFAULT 0 NOT NULL,
    item_name character varying(100) NOT NULL,
    socketed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: workstation_slots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workstation_slots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workstation_slots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workstation_slots_id_seq OWNED BY public.workstation_slots.id;


--
-- Name: workstations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workstations (
    id integer NOT NULL,
    player_id integer NOT NULL,
    location_id integer NOT NULL,
    type character varying(50) NOT NULL,
    tier integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp with time zone,
    fuel_until timestamp with time zone
);


--
-- Name: workstations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workstations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workstations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workstations_id_seq OWNED BY public.workstations.id;


--
-- Name: action_presentation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_presentation ALTER COLUMN id SET DEFAULT nextval('public.action_presentation_id_seq'::regclass);


--
-- Name: animal_species id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animal_species ALTER COLUMN id SET DEFAULT nextval('public.animal_species_id_seq'::regclass);


--
-- Name: bait_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bait_values ALTER COLUMN id SET DEFAULT nextval('public.bait_values_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: content_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_changes ALTER COLUMN id SET DEFAULT nextval('public.content_changes_id_seq'::regclass);


--
-- Name: crops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crops ALTER COLUMN id SET DEFAULT nextval('public.crops_id_seq'::regclass);


--
-- Name: drop_table_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_table_entries ALTER COLUMN id SET DEFAULT nextval('public.drop_table_entries_id_seq'::regclass);


--
-- Name: farm_plots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_plots ALTER COLUMN id SET DEFAULT nextval('public.farm_plots_id_seq'::regclass);


--
-- Name: feats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feats ALTER COLUMN id SET DEFAULT nextval('public.feats_id_seq'::regclass);


--
-- Name: fish_species id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fish_species ALTER COLUMN id SET DEFAULT nextval('public.fish_species_id_seq'::regclass);


--
-- Name: foraging_habitats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foraging_habitats ALTER COLUMN id SET DEFAULT nextval('public.foraging_habitats_id_seq'::regclass);


--
-- Name: forum_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_categories ALTER COLUMN id SET DEFAULT nextval('public.forum_categories_id_seq'::regclass);


--
-- Name: forum_poll_options id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_options ALTER COLUMN id SET DEFAULT nextval('public.forum_poll_options_id_seq'::regclass);


--
-- Name: forum_poll_votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes ALTER COLUMN id SET DEFAULT nextval('public.forum_poll_votes_id_seq'::regclass);


--
-- Name: forum_polls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_polls ALTER COLUMN id SET DEFAULT nextval('public.forum_polls_id_seq'::regclass);


--
-- Name: forum_post_votes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_votes ALTER COLUMN id SET DEFAULT nextval('public.forum_post_votes_id_seq'::regclass);


--
-- Name: forum_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts ALTER COLUMN id SET DEFAULT nextval('public.forum_posts_id_seq'::regclass);


--
-- Name: forum_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads ALTER COLUMN id SET DEFAULT nextval('public.forum_threads_id_seq'::regclass);


--
-- Name: gold_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold_ledger ALTER COLUMN id SET DEFAULT nextval('public.gold_ledger_id_seq'::regclass);


--
-- Name: ground_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ground_items ALTER COLUMN id SET DEFAULT nextval('public.ground_items_id_seq'::regclass);


--
-- Name: guild_applications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_applications ALTER COLUMN id SET DEFAULT nextval('public.guild_applications_id_seq'::regclass);


--
-- Name: guild_forum_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_categories ALTER COLUMN id SET DEFAULT nextval('public.guild_forum_categories_id_seq'::regclass);


--
-- Name: guild_forum_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_posts ALTER COLUMN id SET DEFAULT nextval('public.guild_forum_posts_id_seq'::regclass);


--
-- Name: guild_forum_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_threads ALTER COLUMN id SET DEFAULT nextval('public.guild_forum_threads_id_seq'::regclass);


--
-- Name: guild_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_invites ALTER COLUMN id SET DEFAULT nextval('public.guild_invites_id_seq'::regclass);


--
-- Name: guild_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_members ALTER COLUMN id SET DEFAULT nextval('public.guild_members_id_seq'::regclass);


--
-- Name: guilds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guilds ALTER COLUMN id SET DEFAULT nextval('public.guilds_id_seq'::regclass);


--
-- Name: huntable_animals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.huntable_animals ALTER COLUMN id SET DEFAULT nextval('public.huntable_animals_id_seq'::regclass);


--
-- Name: item_firsts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_firsts ALTER COLUMN id SET DEFAULT nextval('public.item_firsts_id_seq'::regclass);


--
-- Name: items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items ALTER COLUMN id SET DEFAULT nextval('public.items_id_seq'::regclass);


--
-- Name: kiln_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiln_jobs ALTER COLUMN id SET DEFAULT nextval('public.kiln_jobs_id_seq'::regclass);


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: location_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_connections ALTER COLUMN id SET DEFAULT nextval('public.location_connections_id_seq'::regclass);


--
-- Name: locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations ALTER COLUMN id SET DEFAULT nextval('public.locations_id_seq'::regclass);


--
-- Name: loot_log_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_entries ALTER COLUMN id SET DEFAULT nextval('public.loot_log_entries_id_seq'::regclass);


--
-- Name: loot_log_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_sources ALTER COLUMN id SET DEFAULT nextval('public.loot_log_sources_id_seq'::regclass);


--
-- Name: manual_pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_pages ALTER COLUMN id SET DEFAULT nextval('public.manual_pages_id_seq'::regclass);


--
-- Name: merchant_stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_stock ALTER COLUMN id SET DEFAULT nextval('public.merchant_stock_id_seq'::regclass);


--
-- Name: merchants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants ALTER COLUMN id SET DEFAULT nextval('public.merchants_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: mod_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_permissions ALTER COLUMN id SET DEFAULT nextval('public.mod_permissions_id_seq'::regclass);


--
-- Name: mutes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutes ALTER COLUMN id SET DEFAULT nextval('public.mutes_id_seq'::regclass);


--
-- Name: news_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts ALTER COLUMN id SET DEFAULT nextval('public.news_posts_id_seq'::regclass);


--
-- Name: npc_dialogues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_dialogues ALTER COLUMN id SET DEFAULT nextval('public.npc_dialogues_id_seq'::regclass);


--
-- Name: npc_purchase_daily id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_purchase_daily ALTER COLUMN id SET DEFAULT nextval('public.npc_purchase_daily_id_seq'::regclass);


--
-- Name: npc_sale_daily id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_sale_daily ALTER COLUMN id SET DEFAULT nextval('public.npc_sale_daily_id_seq'::regclass);


--
-- Name: npcs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npcs ALTER COLUMN id SET DEFAULT nextval('public.npcs_id_seq'::regclass);


--
-- Name: ore_veins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ore_veins ALTER COLUMN id SET DEFAULT nextval('public.ore_veins_id_seq'::regclass);


--
-- Name: pen_flowers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pen_flowers ALTER COLUMN id SET DEFAULT nextval('public.pen_flowers_id_seq'::regclass);


--
-- Name: player_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_actions ALTER COLUMN id SET DEFAULT nextval('public.player_actions_id_seq'::regclass);


--
-- Name: player_animals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_animals ALTER COLUMN id SET DEFAULT nextval('public.player_animals_id_seq'::regclass);


--
-- Name: player_bait id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_bait ALTER COLUMN id SET DEFAULT nextval('public.player_bait_id_seq'::regclass);


--
-- Name: player_buffs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_buffs ALTER COLUMN id SET DEFAULT nextval('public.player_buffs_id_seq'::regclass);


--
-- Name: player_equipment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment ALTER COLUMN id SET DEFAULT nextval('public.player_equipment_id_seq'::regclass);


--
-- Name: player_exploration id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_exploration ALTER COLUMN id SET DEFAULT nextval('public.player_exploration_id_seq'::regclass);


--
-- Name: player_feats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_feats ALTER COLUMN id SET DEFAULT nextval('public.player_feats_id_seq'::regclass);


--
-- Name: player_fishing_discoveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_discoveries ALTER COLUMN id SET DEFAULT nextval('public.player_fishing_discoveries_id_seq'::regclass);


--
-- Name: player_fishing_records id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_records ALTER COLUMN id SET DEFAULT nextval('public.player_fishing_records_id_seq'::regclass);


--
-- Name: player_foraging_discoveries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_foraging_discoveries ALTER COLUMN id SET DEFAULT nextval('public.player_foraging_discoveries_id_seq'::regclass);


--
-- Name: player_hints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_hints ALTER COLUMN id SET DEFAULT nextval('public.player_hints_id_seq'::regclass);


--
-- Name: player_inventory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_inventory ALTER COLUMN id SET DEFAULT nextval('public.player_inventory_id_seq'::regclass);


--
-- Name: player_item_firsts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_item_firsts ALTER COLUMN id SET DEFAULT nextval('public.player_item_firsts_id_seq'::regclass);


--
-- Name: player_liquids id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_liquids ALTER COLUMN id SET DEFAULT nextval('public.player_liquids_id_seq'::regclass);


--
-- Name: player_palettes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_palettes ALTER COLUMN id SET DEFAULT nextval('public.player_palettes_id_seq'::regclass);


--
-- Name: player_pens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_pens ALTER COLUMN id SET DEFAULT nextval('public.player_pens_id_seq'::regclass);


--
-- Name: player_properties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_properties ALTER COLUMN id SET DEFAULT nextval('public.player_properties_id_seq'::regclass);


--
-- Name: player_quest_objectives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quest_objectives ALTER COLUMN id SET DEFAULT nextval('public.player_quest_objectives_id_seq'::regclass);


--
-- Name: player_quests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quests ALTER COLUMN id SET DEFAULT nextval('public.player_quests_id_seq'::regclass);


--
-- Name: player_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_settings ALTER COLUMN id SET DEFAULT nextval('public.player_settings_id_seq'::regclass);


--
-- Name: player_shops id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_shops ALTER COLUMN id SET DEFAULT nextval('public.player_shops_id_seq'::regclass);


--
-- Name: player_skills id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_skills ALTER COLUMN id SET DEFAULT nextval('public.player_skills_id_seq'::regclass);


--
-- Name: player_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_stats ALTER COLUMN id SET DEFAULT nextval('public.player_stats_id_seq'::regclass);


--
-- Name: player_traps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps ALTER COLUMN id SET DEFAULT nextval('public.player_traps_id_seq'::regclass);


--
-- Name: player_unlocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_unlocks ALTER COLUMN id SET DEFAULT nextval('public.player_unlocks_id_seq'::regclass);


--
-- Name: players id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players ALTER COLUMN id SET DEFAULT nextval('public.players_id_seq'::regclass);


--
-- Name: property_storage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_storage ALTER COLUMN id SET DEFAULT nextval('public.property_storage_id_seq'::regclass);


--
-- Name: quest_objectives id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_objectives ALTER COLUMN id SET DEFAULT nextval('public.quest_objectives_id_seq'::regclass);


--
-- Name: quests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests ALTER COLUMN id SET DEFAULT nextval('public.quests_id_seq'::regclass);


--
-- Name: recipes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes ALTER COLUMN id SET DEFAULT nextval('public.recipes_id_seq'::regclass);


--
-- Name: resource_nodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_nodes ALTER COLUMN id SET DEFAULT nextval('public.resource_nodes_id_seq'::regclass);


--
-- Name: shop_buy_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_buy_orders ALTER COLUMN id SET DEFAULT nextval('public.shop_buy_orders_id_seq'::regclass);


--
-- Name: shop_listings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_listings ALTER COLUMN id SET DEFAULT nextval('public.shop_listings_id_seq'::regclass);


--
-- Name: shop_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions ALTER COLUMN id SET DEFAULT nextval('public.shop_transactions_id_seq'::regclass);


--
-- Name: skill_milestone_firsts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_milestone_firsts ALTER COLUMN id SET DEFAULT nextval('public.skill_milestone_firsts_id_seq'::regclass);


--
-- Name: skill_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_snapshots ALTER COLUMN id SET DEFAULT nextval('public.skill_snapshots_id_seq'::regclass);


--
-- Name: skills id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills ALTER COLUMN id SET DEFAULT nextval('public.skills_id_seq'::regclass);


--
-- Name: taler_adjustments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_adjustments ALTER COLUMN id SET DEFAULT nextval('public.taler_adjustments_id_seq'::regclass);


--
-- Name: taler_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_ledger ALTER COLUMN id SET DEFAULT nextval('public.taler_ledger_id_seq'::regclass);


--
-- Name: taler_purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_purchases ALTER COLUMN id SET DEFAULT nextval('public.taler_purchases_id_seq'::regclass);


--
-- Name: tally_boards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tally_boards ALTER COLUMN id SET DEFAULT nextval('public.tally_boards_id_seq'::regclass);


--
-- Name: tanning_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanning_jobs ALTER COLUMN id SET DEFAULT nextval('public.tanning_jobs_id_seq'::regclass);


--
-- Name: trade_gold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_gold ALTER COLUMN id SET DEFAULT nextval('public.trade_gold_id_seq'::regclass);


--
-- Name: trade_offers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_offers ALTER COLUMN id SET DEFAULT nextval('public.trade_offers_id_seq'::regclass);


--
-- Name: trades id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades ALTER COLUMN id SET DEFAULT nextval('public.trades_id_seq'::regclass);


--
-- Name: trap_targets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_targets ALTER COLUMN id SET DEFAULT nextval('public.trap_targets_id_seq'::regclass);


--
-- Name: trap_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_types ALTER COLUMN id SET DEFAULT nextval('public.trap_types_id_seq'::regclass);


--
-- Name: travel_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_log ALTER COLUMN id SET DEFAULT nextval('public.travel_log_id_seq'::regclass);


--
-- Name: warnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings ALTER COLUMN id SET DEFAULT nextval('public.warnings_id_seq'::regclass);


--
-- Name: workstation_slot_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slot_types ALTER COLUMN id SET DEFAULT nextval('public.workstation_slot_types_id_seq'::regclass);


--
-- Name: workstation_slots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slots ALTER COLUMN id SET DEFAULT nextval('public.workstation_slots_id_seq'::regclass);


--
-- Name: workstations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstations ALTER COLUMN id SET DEFAULT nextval('public.workstations_id_seq'::regclass);


--
-- Name: action_presentation action_presentation_action_type_kind_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_presentation
    ADD CONSTRAINT action_presentation_action_type_kind_unique UNIQUE (action_type, kind);


--
-- Name: action_presentation action_presentation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.action_presentation
    ADD CONSTRAINT action_presentation_pkey PRIMARY KEY (id);


--
-- Name: animal_species animal_species_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animal_species
    ADD CONSTRAINT animal_species_name_unique UNIQUE (name);


--
-- Name: animal_species animal_species_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animal_species
    ADD CONSTRAINT animal_species_pkey PRIMARY KEY (id);


--
-- Name: bait_values bait_values_item_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bait_values
    ADD CONSTRAINT bait_values_item_name_unique UNIQUE (item_name);


--
-- Name: bait_values bait_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bait_values
    ADD CONSTRAINT bait_values_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: content_changes content_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_changes
    ADD CONSTRAINT content_changes_pkey PRIMARY KEY (id);


--
-- Name: crops crops_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crops
    ADD CONSTRAINT crops_name_unique UNIQUE (name);


--
-- Name: crops crops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crops
    ADD CONSTRAINT crops_pkey PRIMARY KEY (id);


--
-- Name: drop_table_entries drop_table_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_table_entries
    ADD CONSTRAINT drop_table_entries_pkey PRIMARY KEY (id);


--
-- Name: farm_plots farm_plots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_plots
    ADD CONSTRAINT farm_plots_pkey PRIMARY KEY (id);


--
-- Name: farm_plots farm_plots_property_id_slot_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_plots
    ADD CONSTRAINT farm_plots_property_id_slot_index_unique UNIQUE (property_id, slot_index);


--
-- Name: feats feats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feats
    ADD CONSTRAINT feats_pkey PRIMARY KEY (id);


--
-- Name: feats feats_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feats
    ADD CONSTRAINT feats_slug_unique UNIQUE (slug);


--
-- Name: fish_species fish_species_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fish_species
    ADD CONSTRAINT fish_species_name_unique UNIQUE (name);


--
-- Name: fish_species fish_species_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fish_species
    ADD CONSTRAINT fish_species_pkey PRIMARY KEY (id);


--
-- Name: foraging_habitats foraging_habitats_location_id_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foraging_habitats
    ADD CONSTRAINT foraging_habitats_location_id_name_unique UNIQUE (location_id, name);


--
-- Name: foraging_habitats foraging_habitats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foraging_habitats
    ADD CONSTRAINT foraging_habitats_pkey PRIMARY KEY (id);


--
-- Name: forum_categories forum_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_categories
    ADD CONSTRAINT forum_categories_pkey PRIMARY KEY (id);


--
-- Name: forum_poll_options forum_poll_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_options
    ADD CONSTRAINT forum_poll_options_pkey PRIMARY KEY (id);


--
-- Name: forum_poll_votes forum_poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_pkey PRIMARY KEY (id);


--
-- Name: forum_poll_votes forum_poll_votes_poll_id_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_poll_id_player_id_unique UNIQUE (poll_id, player_id);


--
-- Name: forum_polls forum_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_polls
    ADD CONSTRAINT forum_polls_pkey PRIMARY KEY (id);


--
-- Name: forum_post_votes forum_post_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_votes
    ADD CONSTRAINT forum_post_votes_pkey PRIMARY KEY (id);


--
-- Name: forum_post_votes forum_post_votes_post_id_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_votes
    ADD CONSTRAINT forum_post_votes_post_id_player_id_unique UNIQUE (post_id, player_id);


--
-- Name: forum_posts forum_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_pkey PRIMARY KEY (id);


--
-- Name: forum_threads forum_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_pkey PRIMARY KEY (id);


--
-- Name: gold_ledger gold_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold_ledger
    ADD CONSTRAINT gold_ledger_pkey PRIMARY KEY (id);


--
-- Name: ground_items ground_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ground_items
    ADD CONSTRAINT ground_items_pkey PRIMARY KEY (id);


--
-- Name: guild_applications guild_applications_guild_id_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_applications
    ADD CONSTRAINT guild_applications_guild_id_player_id_unique UNIQUE (guild_id, player_id);


--
-- Name: guild_applications guild_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_applications
    ADD CONSTRAINT guild_applications_pkey PRIMARY KEY (id);


--
-- Name: guild_forum_categories guild_forum_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_categories
    ADD CONSTRAINT guild_forum_categories_pkey PRIMARY KEY (id);


--
-- Name: guild_forum_posts guild_forum_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_posts
    ADD CONSTRAINT guild_forum_posts_pkey PRIMARY KEY (id);


--
-- Name: guild_forum_threads guild_forum_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_threads
    ADD CONSTRAINT guild_forum_threads_pkey PRIMARY KEY (id);


--
-- Name: guild_invites guild_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_invites
    ADD CONSTRAINT guild_invites_pkey PRIMARY KEY (id);


--
-- Name: guild_members guild_members_guild_id_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_members
    ADD CONSTRAINT guild_members_guild_id_player_id_unique UNIQUE (guild_id, player_id);


--
-- Name: guild_members guild_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_members
    ADD CONSTRAINT guild_members_pkey PRIMARY KEY (id);


--
-- Name: guilds guilds_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guilds
    ADD CONSTRAINT guilds_name_unique UNIQUE (name);


--
-- Name: guilds guilds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guilds
    ADD CONSTRAINT guilds_pkey PRIMARY KEY (id);


--
-- Name: guilds guilds_tag_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guilds
    ADD CONSTRAINT guilds_tag_unique UNIQUE (tag);


--
-- Name: huntable_animals huntable_animals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.huntable_animals
    ADD CONSTRAINT huntable_animals_pkey PRIMARY KEY (id);


--
-- Name: item_firsts item_firsts_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_firsts
    ADD CONSTRAINT item_firsts_item_id_unique UNIQUE (item_id);


--
-- Name: item_firsts item_firsts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_firsts
    ADD CONSTRAINT item_firsts_pkey PRIMARY KEY (id);


--
-- Name: items items_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_name_unique UNIQUE (name);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: kiln_jobs kiln_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiln_jobs
    ADD CONSTRAINT kiln_jobs_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: location_connections location_connections_from_location_id_to_location_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_connections
    ADD CONSTRAINT location_connections_from_location_id_to_location_id_unique UNIQUE (from_location_id, to_location_id);


--
-- Name: location_connections location_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_connections
    ADD CONSTRAINT location_connections_pkey PRIMARY KEY (id);


--
-- Name: locations locations_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_name_unique UNIQUE (name);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: loot_log_entries loot_log_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_entries
    ADD CONSTRAINT loot_log_entries_pkey PRIMARY KEY (id);


--
-- Name: loot_log_entries loot_log_entries_source_id_kind_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_entries
    ADD CONSTRAINT loot_log_entries_source_id_kind_name_unique UNIQUE (source_id, kind, name);


--
-- Name: loot_log_sources loot_log_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_sources
    ADD CONSTRAINT loot_log_sources_pkey PRIMARY KEY (id);


--
-- Name: loot_log_sources loot_log_sources_player_id_source_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_sources
    ADD CONSTRAINT loot_log_sources_player_id_source_unique UNIQUE (player_id, source);


--
-- Name: manual_pages manual_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_pages
    ADD CONSTRAINT manual_pages_pkey PRIMARY KEY (id);


--
-- Name: manual_pages manual_pages_section_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_pages
    ADD CONSTRAINT manual_pages_section_slug_unique UNIQUE (section, slug);


--
-- Name: merchant_stock merchant_stock_merchant_id_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_stock
    ADD CONSTRAINT merchant_stock_merchant_id_item_id_unique UNIQUE (merchant_id, item_id);


--
-- Name: merchant_stock merchant_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_stock
    ADD CONSTRAINT merchant_stock_pkey PRIMARY KEY (id);


--
-- Name: merchants merchants_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_key_unique UNIQUE (key);


--
-- Name: merchants merchants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: mod_permissions mod_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_permissions
    ADD CONSTRAINT mod_permissions_pkey PRIMARY KEY (id);


--
-- Name: mod_permissions mod_permissions_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_permissions
    ADD CONSTRAINT mod_permissions_player_id_unique UNIQUE (player_id);


--
-- Name: mutes mutes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutes
    ADD CONSTRAINT mutes_pkey PRIMARY KEY (id);


--
-- Name: news_posts news_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts
    ADD CONSTRAINT news_posts_pkey PRIMARY KEY (id);


--
-- Name: npc_dialogues npc_dialogues_npc_id_stage_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_dialogues
    ADD CONSTRAINT npc_dialogues_npc_id_stage_key_unique UNIQUE (npc_id, stage_key);


--
-- Name: npc_dialogues npc_dialogues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_dialogues
    ADD CONSTRAINT npc_dialogues_pkey PRIMARY KEY (id);


--
-- Name: npc_purchase_daily npc_purchase_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_purchase_daily
    ADD CONSTRAINT npc_purchase_daily_pkey PRIMARY KEY (id);


--
-- Name: npc_purchase_daily npc_purchase_daily_player_id_item_id_purchase_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_purchase_daily
    ADD CONSTRAINT npc_purchase_daily_player_id_item_id_purchase_date_unique UNIQUE (player_id, item_id, purchase_date);


--
-- Name: npc_sale_daily npc_sale_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_sale_daily
    ADD CONSTRAINT npc_sale_daily_pkey PRIMARY KEY (id);


--
-- Name: npc_sale_daily npc_sale_daily_player_id_item_id_sale_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_sale_daily
    ADD CONSTRAINT npc_sale_daily_player_id_item_id_sale_date_unique UNIQUE (player_id, item_id, sale_date);


--
-- Name: npcs npcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npcs
    ADD CONSTRAINT npcs_pkey PRIMARY KEY (id);


--
-- Name: ore_veins ore_veins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ore_veins
    ADD CONSTRAINT ore_veins_pkey PRIMARY KEY (id);


--
-- Name: pen_flowers pen_flowers_pen_id_slot_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pen_flowers
    ADD CONSTRAINT pen_flowers_pen_id_slot_index_unique UNIQUE (pen_id, slot_index);


--
-- Name: pen_flowers pen_flowers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pen_flowers
    ADD CONSTRAINT pen_flowers_pkey PRIMARY KEY (id);


--
-- Name: player_actions player_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_actions
    ADD CONSTRAINT player_actions_pkey PRIMARY KEY (id);


--
-- Name: player_actions player_actions_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_actions
    ADD CONSTRAINT player_actions_player_id_unique UNIQUE (player_id);


--
-- Name: player_animals player_animals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_animals
    ADD CONSTRAINT player_animals_pkey PRIMARY KEY (id);


--
-- Name: player_bait player_bait_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_bait
    ADD CONSTRAINT player_bait_pkey PRIMARY KEY (id);


--
-- Name: player_bait player_bait_player_id_category_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_bait
    ADD CONSTRAINT player_bait_player_id_category_unique UNIQUE (player_id, category);


--
-- Name: player_buffs player_buffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_buffs
    ADD CONSTRAINT player_buffs_pkey PRIMARY KEY (id);


--
-- Name: player_buffs player_buffs_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_buffs
    ADD CONSTRAINT player_buffs_player_id_unique UNIQUE (player_id);


--
-- Name: player_equipment player_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_pkey PRIMARY KEY (id);


--
-- Name: player_equipment player_equipment_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_player_id_unique UNIQUE (player_id);


--
-- Name: player_exploration player_exploration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_exploration
    ADD CONSTRAINT player_exploration_pkey PRIMARY KEY (id);


--
-- Name: player_exploration player_exploration_player_id_discovery_type_discovery_key_uniqu; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_exploration
    ADD CONSTRAINT player_exploration_player_id_discovery_type_discovery_key_uniqu UNIQUE (player_id, discovery_type, discovery_key);


--
-- Name: player_feats player_feats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_feats
    ADD CONSTRAINT player_feats_pkey PRIMARY KEY (id);


--
-- Name: player_feats player_feats_player_id_feat_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_feats
    ADD CONSTRAINT player_feats_player_id_feat_id_unique UNIQUE (player_id, feat_id);


--
-- Name: player_fishing_discoveries player_fishing_discoveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_discoveries
    ADD CONSTRAINT player_fishing_discoveries_pkey PRIMARY KEY (id);


--
-- Name: player_fishing_discoveries player_fishing_discoveries_player_id_species_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_discoveries
    ADD CONSTRAINT player_fishing_discoveries_player_id_species_unique UNIQUE (player_id, species);


--
-- Name: player_fishing_records player_fishing_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_records
    ADD CONSTRAINT player_fishing_records_pkey PRIMARY KEY (id);


--
-- Name: player_fishing_records player_fishing_records_player_id_species_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_records
    ADD CONSTRAINT player_fishing_records_player_id_species_unique UNIQUE (player_id, species);


--
-- Name: player_foraging_discoveries player_foraging_discoveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_foraging_discoveries
    ADD CONSTRAINT player_foraging_discoveries_pkey PRIMARY KEY (id);


--
-- Name: player_foraging_discoveries player_foraging_discoveries_player_id_habitat_id_item_name_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_foraging_discoveries
    ADD CONSTRAINT player_foraging_discoveries_player_id_habitat_id_item_name_uniq UNIQUE (player_id, habitat_id, item_name);


--
-- Name: player_hints player_hints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_hints
    ADD CONSTRAINT player_hints_pkey PRIMARY KEY (id);


--
-- Name: player_hints player_hints_player_id_hint_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_hints
    ADD CONSTRAINT player_hints_player_id_hint_key_unique UNIQUE (player_id, hint_key);


--
-- Name: player_inventory player_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_inventory
    ADD CONSTRAINT player_inventory_pkey PRIMARY KEY (id);


--
-- Name: player_inventory player_inventory_player_id_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_inventory
    ADD CONSTRAINT player_inventory_player_id_item_id_unique UNIQUE (player_id, item_id);


--
-- Name: player_item_firsts player_item_firsts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_item_firsts
    ADD CONSTRAINT player_item_firsts_pkey PRIMARY KEY (id);


--
-- Name: player_item_firsts player_item_firsts_player_id_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_item_firsts
    ADD CONSTRAINT player_item_firsts_player_id_item_id_unique UNIQUE (player_id, item_id);


--
-- Name: player_liquids player_liquids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_liquids
    ADD CONSTRAINT player_liquids_pkey PRIMARY KEY (id);


--
-- Name: player_liquids player_liquids_player_id_liquid_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_liquids
    ADD CONSTRAINT player_liquids_player_id_liquid_unique UNIQUE (player_id, liquid);


--
-- Name: player_palettes player_palettes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_palettes
    ADD CONSTRAINT player_palettes_pkey PRIMARY KEY (id);


--
-- Name: player_palettes player_palettes_player_id_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_palettes
    ADD CONSTRAINT player_palettes_player_id_name_unique UNIQUE (player_id, name);


--
-- Name: player_pens player_pens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_pens
    ADD CONSTRAINT player_pens_pkey PRIMARY KEY (id);


--
-- Name: player_pens player_pens_property_id_slot_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_pens
    ADD CONSTRAINT player_pens_property_id_slot_index_unique UNIQUE (property_id, slot_index);


--
-- Name: player_properties player_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_properties
    ADD CONSTRAINT player_properties_pkey PRIMARY KEY (id);


--
-- Name: player_properties player_properties_player_id_location_id_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_properties
    ADD CONSTRAINT player_properties_player_id_location_id_type_unique UNIQUE (player_id, location_id, type);


--
-- Name: player_quest_objectives player_quest_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quest_objectives
    ADD CONSTRAINT player_quest_objectives_pkey PRIMARY KEY (id);


--
-- Name: player_quest_objectives player_quest_objectives_player_id_objective_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quest_objectives
    ADD CONSTRAINT player_quest_objectives_player_id_objective_id_unique UNIQUE (player_id, objective_id);


--
-- Name: player_quests player_quests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quests
    ADD CONSTRAINT player_quests_pkey PRIMARY KEY (id);


--
-- Name: player_quests player_quests_player_id_quest_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quests
    ADD CONSTRAINT player_quests_player_id_quest_id_unique UNIQUE (player_id, quest_id);


--
-- Name: player_settings player_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_settings
    ADD CONSTRAINT player_settings_pkey PRIMARY KEY (id);


--
-- Name: player_settings player_settings_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_settings
    ADD CONSTRAINT player_settings_player_id_unique UNIQUE (player_id);


--
-- Name: player_shops player_shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_shops
    ADD CONSTRAINT player_shops_pkey PRIMARY KEY (id);


--
-- Name: player_shops player_shops_property_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_shops
    ADD CONSTRAINT player_shops_property_id_unique UNIQUE (property_id);


--
-- Name: player_skills player_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_skills
    ADD CONSTRAINT player_skills_pkey PRIMARY KEY (id);


--
-- Name: player_skills player_skills_player_id_skill_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_skills
    ADD CONSTRAINT player_skills_player_id_skill_id_unique UNIQUE (player_id, skill_id);


--
-- Name: player_stats player_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_pkey PRIMARY KEY (id);


--
-- Name: player_stats player_stats_player_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_player_id_unique UNIQUE (player_id);


--
-- Name: player_traps player_traps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps
    ADD CONSTRAINT player_traps_pkey PRIMARY KEY (id);


--
-- Name: player_unlocks player_unlocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_unlocks
    ADD CONSTRAINT player_unlocks_pkey PRIMARY KEY (id);


--
-- Name: player_unlocks player_unlocks_player_id_unlock_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_unlocks
    ADD CONSTRAINT player_unlocks_player_id_unlock_key_unique UNIQUE (player_id, unlock_key);


--
-- Name: players players_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_email_unique UNIQUE (email);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: players players_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_username_unique UNIQUE (username);


--
-- Name: property_storage property_storage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_storage
    ADD CONSTRAINT property_storage_pkey PRIMARY KEY (id);


--
-- Name: property_storage property_storage_property_id_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_storage
    ADD CONSTRAINT property_storage_property_id_item_id_unique UNIQUE (property_id, item_id);


--
-- Name: quest_objectives quest_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_objectives
    ADD CONSTRAINT quest_objectives_pkey PRIMARY KEY (id);


--
-- Name: quests quests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_name_unique UNIQUE (name);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: resource_nodes resource_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_nodes
    ADD CONSTRAINT resource_nodes_pkey PRIMARY KEY (id);


--
-- Name: shop_buy_orders shop_buy_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_buy_orders
    ADD CONSTRAINT shop_buy_orders_pkey PRIMARY KEY (id);


--
-- Name: shop_buy_orders shop_buy_orders_shop_id_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_buy_orders
    ADD CONSTRAINT shop_buy_orders_shop_id_item_id_unique UNIQUE (shop_id, item_id);


--
-- Name: shop_listings shop_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_listings
    ADD CONSTRAINT shop_listings_pkey PRIMARY KEY (id);


--
-- Name: shop_listings shop_listings_shop_id_item_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_listings
    ADD CONSTRAINT shop_listings_shop_id_item_id_unique UNIQUE (shop_id, item_id);


--
-- Name: shop_transactions shop_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_pkey PRIMARY KEY (id);


--
-- Name: skill_milestone_firsts skill_milestone_firsts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_milestone_firsts
    ADD CONSTRAINT skill_milestone_firsts_pkey PRIMARY KEY (id);


--
-- Name: skill_milestone_firsts skill_milestone_firsts_skill_name_level_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_milestone_firsts
    ADD CONSTRAINT skill_milestone_firsts_skill_name_level_unique UNIQUE (skill_name, level);


--
-- Name: skill_snapshots skill_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_snapshots
    ADD CONSTRAINT skill_snapshots_pkey PRIMARY KEY (id);


--
-- Name: skill_snapshots skill_snapshots_player_id_skill_id_snapshot_date_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_snapshots
    ADD CONSTRAINT skill_snapshots_player_id_skill_id_snapshot_date_unique UNIQUE (player_id, skill_id, snapshot_date);


--
-- Name: skills skills_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_name_unique UNIQUE (name);


--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (id);


--
-- Name: taler_adjustments taler_adjustments_paddle_adjustment_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_adjustments
    ADD CONSTRAINT taler_adjustments_paddle_adjustment_id_unique UNIQUE (paddle_adjustment_id);


--
-- Name: taler_adjustments taler_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_adjustments
    ADD CONSTRAINT taler_adjustments_pkey PRIMARY KEY (id);


--
-- Name: taler_ledger taler_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_ledger
    ADD CONSTRAINT taler_ledger_pkey PRIMARY KEY (id);


--
-- Name: taler_purchases taler_purchases_paddle_transaction_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_purchases
    ADD CONSTRAINT taler_purchases_paddle_transaction_id_unique UNIQUE (paddle_transaction_id);


--
-- Name: taler_purchases taler_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_purchases
    ADD CONSTRAINT taler_purchases_pkey PRIMARY KEY (id);


--
-- Name: tally_boards tally_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tally_boards
    ADD CONSTRAINT tally_boards_pkey PRIMARY KEY (id);


--
-- Name: tally_boards tally_boards_player_id_location_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tally_boards
    ADD CONSTRAINT tally_boards_player_id_location_id_unique UNIQUE (player_id, location_id);


--
-- Name: tanning_jobs tanning_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanning_jobs
    ADD CONSTRAINT tanning_jobs_pkey PRIMARY KEY (id);


--
-- Name: trade_gold trade_gold_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_gold
    ADD CONSTRAINT trade_gold_pkey PRIMARY KEY (id);


--
-- Name: trade_offers trade_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_offers
    ADD CONSTRAINT trade_offers_pkey PRIMARY KEY (id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: trap_targets trap_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_targets
    ADD CONSTRAINT trap_targets_pkey PRIMARY KEY (id);


--
-- Name: trap_types trap_types_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_types
    ADD CONSTRAINT trap_types_name_unique UNIQUE (name);


--
-- Name: trap_types trap_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_types
    ADD CONSTRAINT trap_types_pkey PRIMARY KEY (id);


--
-- Name: travel_log travel_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_log
    ADD CONSTRAINT travel_log_pkey PRIMARY KEY (id);


--
-- Name: warnings warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_pkey PRIMARY KEY (id);


--
-- Name: workstation_slot_types workstation_slot_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slot_types
    ADD CONSTRAINT workstation_slot_types_pkey PRIMARY KEY (id);


--
-- Name: workstation_slot_types workstation_slot_types_station_type_slot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slot_types
    ADD CONSTRAINT workstation_slot_types_station_type_slot_unique UNIQUE (station_type, slot);


--
-- Name: workstation_slots workstation_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slots
    ADD CONSTRAINT workstation_slots_pkey PRIMARY KEY (id);


--
-- Name: workstation_slots workstation_slots_workstation_id_slot_slot_index_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slots
    ADD CONSTRAINT workstation_slots_workstation_id_slot_slot_index_unique UNIQUE (workstation_id, slot, slot_index);


--
-- Name: workstations workstations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_pkey PRIMARY KEY (id);


--
-- Name: workstations workstations_player_id_location_id_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_player_id_location_id_type_unique UNIQUE (player_id, location_id, type);


--
-- Name: action_presentation_type_default_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX action_presentation_type_default_uniq ON public.action_presentation USING btree (action_type) WHERE (kind IS NULL);


--
-- Name: chat_messages_channel_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_channel_sent_at_idx ON public.chat_messages USING btree (channel, sent_at);


--
-- Name: chat_messages_guild_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_guild_sent_at_idx ON public.chat_messages USING btree (guild_id, sent_at);


--
-- Name: chat_messages_region_sent_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_region_sent_at_idx ON public.chat_messages USING btree (region, sent_at);


--
-- Name: content_changes_table_name_row_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX content_changes_table_name_row_id_index ON public.content_changes USING btree (table_name, row_id);


--
-- Name: drop_table_entries_source_key_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX drop_table_entries_source_key_index ON public.drop_table_entries USING btree (source_key);


--
-- Name: fish_species_location_id_is_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fish_species_location_id_is_active_index ON public.fish_species USING btree (location_id, is_active);


--
-- Name: gold_ledger_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gold_ledger_created_at_index ON public.gold_ledger USING btree (created_at);


--
-- Name: gold_ledger_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gold_ledger_player_id_index ON public.gold_ledger USING btree (player_id);


--
-- Name: gold_ledger_reason_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gold_ledger_reason_index ON public.gold_ledger USING btree (reason);


--
-- Name: ground_items_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ground_items_location_idx ON public.ground_items USING btree (location_id);


--
-- Name: guild_forum_categories_guild_id_sort_order_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guild_forum_categories_guild_id_sort_order_index ON public.guild_forum_categories USING btree (guild_id, sort_order);


--
-- Name: guild_forum_posts_guild_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guild_forum_posts_guild_id_index ON public.guild_forum_posts USING btree (guild_id);


--
-- Name: guild_forum_posts_thread_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guild_forum_posts_thread_id_created_at_index ON public.guild_forum_posts USING btree (thread_id, created_at);


--
-- Name: guild_forum_threads_category_id_is_pinned_last_post_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guild_forum_threads_category_id_is_pinned_last_post_at_index ON public.guild_forum_threads USING btree (category_id, is_pinned, last_post_at);


--
-- Name: guild_forum_threads_guild_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guild_forum_threads_guild_id_index ON public.guild_forum_threads USING btree (guild_id);


--
-- Name: loot_log_entries_source_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loot_log_entries_source_id_index ON public.loot_log_entries USING btree (source_id);


--
-- Name: loot_log_sources_player_id_last_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX loot_log_sources_player_id_last_at_index ON public.loot_log_sources USING btree (player_id, last_at);


--
-- Name: manual_pages_section_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX manual_pages_section_index ON public.manual_pages USING btree (section);


--
-- Name: merchant_stock_merchant_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchant_stock_merchant_id_index ON public.merchant_stock USING btree (merchant_id);


--
-- Name: merchants_location_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX merchants_location_id_index ON public.merchants USING btree (location_id);


--
-- Name: npc_purchase_daily_purchase_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX npc_purchase_daily_purchase_date_index ON public.npc_purchase_daily USING btree (purchase_date);


--
-- Name: npc_sale_daily_sale_date_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX npc_sale_daily_sale_date_index ON public.npc_sale_daily USING btree (sale_date);


--
-- Name: pen_flowers_pen_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pen_flowers_pen_id_index ON public.pen_flowers USING btree (pen_id);


--
-- Name: player_animals_pen_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_animals_pen_id_index ON public.player_animals USING btree (pen_id);


--
-- Name: player_animals_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_animals_player_id_index ON public.player_animals USING btree (player_id);


--
-- Name: player_buffs_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_buffs_expires_at_index ON public.player_buffs USING btree (expires_at);


--
-- Name: player_feats_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_feats_player_id_index ON public.player_feats USING btree (player_id);


--
-- Name: player_foraging_discoveries_player_id_habitat_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_foraging_discoveries_player_id_habitat_id_index ON public.player_foraging_discoveries USING btree (player_id, habitat_id);


--
-- Name: player_item_firsts_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_item_firsts_player_id_index ON public.player_item_firsts USING btree (player_id);


--
-- Name: player_traps_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_traps_player_id_index ON public.player_traps USING btree (player_id);


--
-- Name: player_traps_state_next_roll_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX player_traps_state_next_roll_at_index ON public.player_traps USING btree (state, next_roll_at);


--
-- Name: players_email_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX players_email_lower_unique ON public.players USING btree (lower((email)::text));


--
-- Name: players_guest_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX players_guest_expiry_idx ON public.players USING btree (guest_expires_at) WHERE (is_guest = true);


--
-- Name: players_username_lower_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX players_username_lower_unique ON public.players USING btree (lower((username)::text));


--
-- Name: players_was_guest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX players_was_guest_idx ON public.players USING btree (is_guest) WHERE (was_guest = true);


--
-- Name: property_storage_property_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX property_storage_property_id_index ON public.property_storage USING btree (property_id);


--
-- Name: shop_buy_orders_item_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_buy_orders_item_id_index ON public.shop_buy_orders USING btree (item_id);


--
-- Name: shop_listings_item_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_listings_item_id_index ON public.shop_listings USING btree (item_id);


--
-- Name: shop_transactions_shop_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shop_transactions_shop_id_created_at_index ON public.shop_transactions USING btree (shop_id, created_at);


--
-- Name: taler_adjustments_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taler_adjustments_player_id_index ON public.taler_adjustments USING btree (player_id);


--
-- Name: taler_adjustments_purchase_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taler_adjustments_purchase_id_index ON public.taler_adjustments USING btree (purchase_id);


--
-- Name: taler_ledger_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taler_ledger_player_id_index ON public.taler_ledger USING btree (player_id);


--
-- Name: taler_purchases_player_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX taler_purchases_player_id_index ON public.taler_purchases USING btree (player_id);


--
-- Name: tally_boards_location_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tally_boards_location_id_index ON public.tally_boards USING btree (location_id);


--
-- Name: tanning_jobs_player_id_location_id_is_collected_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tanning_jobs_player_id_location_id_is_collected_index ON public.tanning_jobs USING btree (player_id, location_id, is_collected);


--
-- Name: travel_log_player_id_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX travel_log_player_id_created_at_index ON public.travel_log USING btree (player_id, created_at);


--
-- Name: workstation_slots_workstation_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workstation_slots_workstation_id_index ON public.workstation_slots USING btree (workstation_id);


--
-- Name: workstations_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workstations_expires_at_index ON public.workstations USING btree (expires_at);


--
-- Name: chat_messages chat_messages_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: content_changes content_changes_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_changes
    ADD CONSTRAINT content_changes_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: content_changes content_changes_reverts_change_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_changes
    ADD CONSTRAINT content_changes_reverts_change_id_foreign FOREIGN KEY (reverts_change_id) REFERENCES public.content_changes(id) ON DELETE SET NULL;


--
-- Name: drop_table_entries drop_table_entries_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drop_table_entries
    ADD CONSTRAINT drop_table_entries_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: farm_plots farm_plots_crop_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_plots
    ADD CONSTRAINT farm_plots_crop_id_foreign FOREIGN KEY (crop_id) REFERENCES public.crops(id) ON DELETE SET NULL;


--
-- Name: farm_plots farm_plots_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.farm_plots
    ADD CONSTRAINT farm_plots_property_id_foreign FOREIGN KEY (property_id) REFERENCES public.player_properties(id) ON DELETE CASCADE;


--
-- Name: fish_species fish_species_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fish_species
    ADD CONSTRAINT fish_species_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: foraging_habitats foraging_habitats_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foraging_habitats
    ADD CONSTRAINT foraging_habitats_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: forum_poll_options forum_poll_options_poll_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_options
    ADD CONSTRAINT forum_poll_options_poll_id_foreign FOREIGN KEY (poll_id) REFERENCES public.forum_polls(id) ON DELETE CASCADE;


--
-- Name: forum_poll_votes forum_poll_votes_option_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_option_id_foreign FOREIGN KEY (option_id) REFERENCES public.forum_poll_options(id) ON DELETE CASCADE;


--
-- Name: forum_poll_votes forum_poll_votes_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: forum_poll_votes forum_poll_votes_poll_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_poll_votes
    ADD CONSTRAINT forum_poll_votes_poll_id_foreign FOREIGN KEY (poll_id) REFERENCES public.forum_polls(id) ON DELETE CASCADE;


--
-- Name: forum_polls forum_polls_thread_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_polls
    ADD CONSTRAINT forum_polls_thread_id_foreign FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_post_votes forum_post_votes_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_votes
    ADD CONSTRAINT forum_post_votes_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: forum_post_votes forum_post_votes_post_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_post_votes
    ADD CONSTRAINT forum_post_votes_post_id_foreign FOREIGN KEY (post_id) REFERENCES public.forum_posts(id) ON DELETE CASCADE;


--
-- Name: forum_posts forum_posts_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: forum_posts forum_posts_thread_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_posts
    ADD CONSTRAINT forum_posts_thread_id_foreign FOREIGN KEY (thread_id) REFERENCES public.forum_threads(id) ON DELETE CASCADE;


--
-- Name: forum_threads forum_threads_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: forum_threads forum_threads_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.forum_categories(id) ON DELETE CASCADE;


--
-- Name: forum_threads forum_threads_last_post_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.forum_threads
    ADD CONSTRAINT forum_threads_last_post_by_foreign FOREIGN KEY (last_post_by) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: gold_ledger gold_ledger_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gold_ledger
    ADD CONSTRAINT gold_ledger_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: ground_items ground_items_dropped_by_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ground_items
    ADD CONSTRAINT ground_items_dropped_by_player_id_foreign FOREIGN KEY (dropped_by_player_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: ground_items ground_items_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ground_items
    ADD CONSTRAINT ground_items_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: ground_items ground_items_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ground_items
    ADD CONSTRAINT ground_items_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: guild_applications guild_applications_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_applications
    ADD CONSTRAINT guild_applications_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE CASCADE;


--
-- Name: guild_applications guild_applications_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_applications
    ADD CONSTRAINT guild_applications_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guild_forum_categories guild_forum_categories_created_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_categories
    ADD CONSTRAINT guild_forum_categories_created_by_foreign FOREIGN KEY (created_by) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: guild_forum_categories guild_forum_categories_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_categories
    ADD CONSTRAINT guild_forum_categories_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE CASCADE;


--
-- Name: guild_forum_posts guild_forum_posts_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_posts
    ADD CONSTRAINT guild_forum_posts_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guild_forum_posts guild_forum_posts_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_posts
    ADD CONSTRAINT guild_forum_posts_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE CASCADE;


--
-- Name: guild_forum_posts guild_forum_posts_thread_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_posts
    ADD CONSTRAINT guild_forum_posts_thread_id_foreign FOREIGN KEY (thread_id) REFERENCES public.guild_forum_threads(id) ON DELETE CASCADE;


--
-- Name: guild_forum_threads guild_forum_threads_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_threads
    ADD CONSTRAINT guild_forum_threads_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guild_forum_threads guild_forum_threads_category_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_threads
    ADD CONSTRAINT guild_forum_threads_category_id_foreign FOREIGN KEY (category_id) REFERENCES public.guild_forum_categories(id) ON DELETE CASCADE;


--
-- Name: guild_forum_threads guild_forum_threads_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_threads
    ADD CONSTRAINT guild_forum_threads_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE CASCADE;


--
-- Name: guild_forum_threads guild_forum_threads_last_post_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_forum_threads
    ADD CONSTRAINT guild_forum_threads_last_post_by_foreign FOREIGN KEY (last_post_by) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: guild_invites guild_invites_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_invites
    ADD CONSTRAINT guild_invites_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE CASCADE;


--
-- Name: guild_invites guild_invites_invited_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_invites
    ADD CONSTRAINT guild_invites_invited_by_foreign FOREIGN KEY (invited_by) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guild_invites guild_invites_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_invites
    ADD CONSTRAINT guild_invites_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guild_members guild_members_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_members
    ADD CONSTRAINT guild_members_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE CASCADE;


--
-- Name: guild_members guild_members_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guild_members
    ADD CONSTRAINT guild_members_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guilds guilds_founder_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guilds
    ADD CONSTRAINT guilds_founder_id_foreign FOREIGN KEY (founder_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: guilds guilds_leader_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guilds
    ADD CONSTRAINT guilds_leader_id_foreign FOREIGN KEY (leader_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: huntable_animals huntable_animals_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.huntable_animals
    ADD CONSTRAINT huntable_animals_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: item_firsts item_firsts_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_firsts
    ADD CONSTRAINT item_firsts_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: item_firsts item_firsts_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_firsts
    ADD CONSTRAINT item_firsts_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: kiln_jobs kiln_jobs_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiln_jobs
    ADD CONSTRAINT kiln_jobs_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: kiln_jobs kiln_jobs_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kiln_jobs
    ADD CONSTRAINT kiln_jobs_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: location_connections location_connections_from_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_connections
    ADD CONSTRAINT location_connections_from_location_id_foreign FOREIGN KEY (from_location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: location_connections location_connections_to_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_connections
    ADD CONSTRAINT location_connections_to_location_id_foreign FOREIGN KEY (to_location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: loot_log_entries loot_log_entries_source_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_entries
    ADD CONSTRAINT loot_log_entries_source_id_foreign FOREIGN KEY (source_id) REFERENCES public.loot_log_sources(id) ON DELETE CASCADE;


--
-- Name: loot_log_sources loot_log_sources_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loot_log_sources
    ADD CONSTRAINT loot_log_sources_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: manual_pages manual_pages_updated_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_pages
    ADD CONSTRAINT manual_pages_updated_by_foreign FOREIGN KEY (updated_by) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: merchant_stock merchant_stock_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_stock
    ADD CONSTRAINT merchant_stock_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: merchant_stock merchant_stock_merchant_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_stock
    ADD CONSTRAINT merchant_stock_merchant_id_foreign FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;


--
-- Name: merchants merchants_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchants
    ADD CONSTRAINT merchants_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: messages messages_recipient_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_recipient_id_foreign FOREIGN KEY (recipient_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: messages messages_reply_to_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_foreign FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_foreign FOREIGN KEY (sender_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: mod_permissions mod_permissions_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mod_permissions
    ADD CONSTRAINT mod_permissions_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: mutes mutes_issued_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutes
    ADD CONSTRAINT mutes_issued_by_foreign FOREIGN KEY (issued_by) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: mutes mutes_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mutes
    ADD CONSTRAINT mutes_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: news_posts news_posts_author_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts
    ADD CONSTRAINT news_posts_author_id_foreign FOREIGN KEY (author_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: news_posts news_posts_forum_thread_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts
    ADD CONSTRAINT news_posts_forum_thread_id_foreign FOREIGN KEY (forum_thread_id) REFERENCES public.forum_threads(id) ON DELETE SET NULL;


--
-- Name: npc_dialogues npc_dialogues_npc_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_dialogues
    ADD CONSTRAINT npc_dialogues_npc_id_foreign FOREIGN KEY (npc_id) REFERENCES public.npcs(id) ON DELETE CASCADE;


--
-- Name: npc_purchase_daily npc_purchase_daily_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_purchase_daily
    ADD CONSTRAINT npc_purchase_daily_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: npc_purchase_daily npc_purchase_daily_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_purchase_daily
    ADD CONSTRAINT npc_purchase_daily_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: npc_sale_daily npc_sale_daily_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_sale_daily
    ADD CONSTRAINT npc_sale_daily_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: npc_sale_daily npc_sale_daily_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npc_sale_daily
    ADD CONSTRAINT npc_sale_daily_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: npcs npcs_hide_after_quest_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npcs
    ADD CONSTRAINT npcs_hide_after_quest_id_foreign FOREIGN KEY (hide_after_quest_id) REFERENCES public.quests(id) ON DELETE SET NULL;


--
-- Name: npcs npcs_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npcs
    ADD CONSTRAINT npcs_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: ore_veins ore_veins_discovered_by_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ore_veins
    ADD CONSTRAINT ore_veins_discovered_by_player_id_foreign FOREIGN KEY (discovered_by_player_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: ore_veins ore_veins_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ore_veins
    ADD CONSTRAINT ore_veins_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: ore_veins ore_veins_ore_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ore_veins
    ADD CONSTRAINT ore_veins_ore_item_id_foreign FOREIGN KEY (ore_item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: pen_flowers pen_flowers_pen_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pen_flowers
    ADD CONSTRAINT pen_flowers_pen_id_foreign FOREIGN KEY (pen_id) REFERENCES public.player_pens(id) ON DELETE CASCADE;


--
-- Name: player_actions player_actions_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_actions
    ADD CONSTRAINT player_actions_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: player_actions player_actions_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_actions
    ADD CONSTRAINT player_actions_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_actions player_actions_resource_node_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_actions
    ADD CONSTRAINT player_actions_resource_node_id_foreign FOREIGN KEY (resource_node_id) REFERENCES public.resource_nodes(id) ON DELETE SET NULL;


--
-- Name: player_animals player_animals_pen_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_animals
    ADD CONSTRAINT player_animals_pen_id_foreign FOREIGN KEY (pen_id) REFERENCES public.player_pens(id) ON DELETE CASCADE;


--
-- Name: player_animals player_animals_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_animals
    ADD CONSTRAINT player_animals_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_animals player_animals_species_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_animals
    ADD CONSTRAINT player_animals_species_id_foreign FOREIGN KEY (species_id) REFERENCES public.animal_species(id) ON DELETE CASCADE;


--
-- Name: player_bait player_bait_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_bait
    ADD CONSTRAINT player_bait_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_buffs player_buffs_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_buffs
    ADD CONSTRAINT player_buffs_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_equipment player_equipment_back_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_back_item_id_foreign FOREIGN KEY (back_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_chest_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_chest_item_id_foreign FOREIGN KEY (chest_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_feet_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_feet_item_id_foreign FOREIGN KEY (feet_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_finger_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_finger_item_id_foreign FOREIGN KEY (finger_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_hands_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_hands_item_id_foreign FOREIGN KEY (hands_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_head_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_head_item_id_foreign FOREIGN KEY (head_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_legs_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_legs_item_id_foreign FOREIGN KEY (legs_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_mainhand_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_mainhand_item_id_foreign FOREIGN KEY (mainhand_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_mount_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_mount_item_id_foreign FOREIGN KEY (mount_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_neck_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_neck_item_id_foreign FOREIGN KEY (neck_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_offhand_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_offhand_item_id_foreign FOREIGN KEY (offhand_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_equipment player_equipment_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_equipment player_equipment_trophy_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_equipment
    ADD CONSTRAINT player_equipment_trophy_item_id_foreign FOREIGN KEY (trophy_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_exploration player_exploration_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_exploration
    ADD CONSTRAINT player_exploration_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_feats player_feats_feat_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_feats
    ADD CONSTRAINT player_feats_feat_id_foreign FOREIGN KEY (feat_id) REFERENCES public.feats(id) ON DELETE CASCADE;


--
-- Name: player_feats player_feats_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_feats
    ADD CONSTRAINT player_feats_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_fishing_discoveries player_fishing_discoveries_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_discoveries
    ADD CONSTRAINT player_fishing_discoveries_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_fishing_records player_fishing_records_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_fishing_records
    ADD CONSTRAINT player_fishing_records_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_foraging_discoveries player_foraging_discoveries_habitat_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_foraging_discoveries
    ADD CONSTRAINT player_foraging_discoveries_habitat_id_foreign FOREIGN KEY (habitat_id) REFERENCES public.foraging_habitats(id) ON DELETE CASCADE;


--
-- Name: player_foraging_discoveries player_foraging_discoveries_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_foraging_discoveries
    ADD CONSTRAINT player_foraging_discoveries_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_hints player_hints_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_hints
    ADD CONSTRAINT player_hints_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_inventory player_inventory_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_inventory
    ADD CONSTRAINT player_inventory_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: player_inventory player_inventory_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_inventory
    ADD CONSTRAINT player_inventory_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_item_firsts player_item_firsts_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_item_firsts
    ADD CONSTRAINT player_item_firsts_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: player_item_firsts player_item_firsts_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_item_firsts
    ADD CONSTRAINT player_item_firsts_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_liquids player_liquids_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_liquids
    ADD CONSTRAINT player_liquids_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_palettes player_palettes_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_palettes
    ADD CONSTRAINT player_palettes_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_pens player_pens_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_pens
    ADD CONSTRAINT player_pens_property_id_foreign FOREIGN KEY (property_id) REFERENCES public.player_properties(id) ON DELETE CASCADE;


--
-- Name: player_pens player_pens_species_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_pens
    ADD CONSTRAINT player_pens_species_id_foreign FOREIGN KEY (species_id) REFERENCES public.animal_species(id) ON DELETE SET NULL;


--
-- Name: player_properties player_properties_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_properties
    ADD CONSTRAINT player_properties_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: player_properties player_properties_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_properties
    ADD CONSTRAINT player_properties_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_quest_objectives player_quest_objectives_objective_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quest_objectives
    ADD CONSTRAINT player_quest_objectives_objective_id_foreign FOREIGN KEY (objective_id) REFERENCES public.quest_objectives(id) ON DELETE CASCADE;


--
-- Name: player_quest_objectives player_quest_objectives_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quest_objectives
    ADD CONSTRAINT player_quest_objectives_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_quests player_quests_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quests
    ADD CONSTRAINT player_quests_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_quests player_quests_quest_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_quests
    ADD CONSTRAINT player_quests_quest_id_foreign FOREIGN KEY (quest_id) REFERENCES public.quests(id) ON DELETE CASCADE;


--
-- Name: player_settings player_settings_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_settings
    ADD CONSTRAINT player_settings_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_shops player_shops_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_shops
    ADD CONSTRAINT player_shops_property_id_foreign FOREIGN KEY (property_id) REFERENCES public.player_properties(id) ON DELETE CASCADE;


--
-- Name: player_skills player_skills_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_skills
    ADD CONSTRAINT player_skills_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_skills player_skills_skill_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_skills
    ADD CONSTRAINT player_skills_skill_id_foreign FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: player_stats player_stats_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_stats
    ADD CONSTRAINT player_stats_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_traps player_traps_bait_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps
    ADD CONSTRAINT player_traps_bait_item_id_foreign FOREIGN KEY (bait_item_id) REFERENCES public.items(id) ON DELETE SET NULL;


--
-- Name: player_traps player_traps_caught_target_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps
    ADD CONSTRAINT player_traps_caught_target_id_foreign FOREIGN KEY (caught_target_id) REFERENCES public.trap_targets(id) ON DELETE SET NULL;


--
-- Name: player_traps player_traps_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps
    ADD CONSTRAINT player_traps_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: player_traps player_traps_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps
    ADD CONSTRAINT player_traps_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_traps player_traps_trap_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_traps
    ADD CONSTRAINT player_traps_trap_type_id_foreign FOREIGN KEY (trap_type_id) REFERENCES public.trap_types(id) ON DELETE CASCADE;


--
-- Name: player_unlocks player_unlocks_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_unlocks
    ADD CONSTRAINT player_unlocks_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: players players_current_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_current_location_id_foreign FOREIGN KEY (current_location_id) REFERENCES public.locations(id) ON DELETE SET NULL;


--
-- Name: players players_guild_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_guild_id_foreign FOREIGN KEY (guild_id) REFERENCES public.guilds(id) ON DELETE SET NULL;


--
-- Name: property_storage property_storage_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_storage
    ADD CONSTRAINT property_storage_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: property_storage property_storage_property_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.property_storage
    ADD CONSTRAINT property_storage_property_id_foreign FOREIGN KEY (property_id) REFERENCES public.player_properties(id) ON DELETE CASCADE;


--
-- Name: quest_objectives quest_objectives_quest_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quest_objectives
    ADD CONSTRAINT quest_objectives_quest_id_foreign FOREIGN KEY (quest_id) REFERENCES public.quests(id) ON DELETE CASCADE;


--
-- Name: quests quests_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quests
    ADD CONSTRAINT quests_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: resource_nodes resource_nodes_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_nodes
    ADD CONSTRAINT resource_nodes_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: shop_buy_orders shop_buy_orders_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_buy_orders
    ADD CONSTRAINT shop_buy_orders_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: shop_buy_orders shop_buy_orders_shop_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_buy_orders
    ADD CONSTRAINT shop_buy_orders_shop_id_foreign FOREIGN KEY (shop_id) REFERENCES public.player_shops(id) ON DELETE CASCADE;


--
-- Name: shop_listings shop_listings_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_listings
    ADD CONSTRAINT shop_listings_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: shop_listings shop_listings_shop_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_listings
    ADD CONSTRAINT shop_listings_shop_id_foreign FOREIGN KEY (shop_id) REFERENCES public.player_shops(id) ON DELETE CASCADE;


--
-- Name: shop_transactions shop_transactions_counterparty_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_counterparty_player_id_foreign FOREIGN KEY (counterparty_player_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: shop_transactions shop_transactions_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: shop_transactions shop_transactions_shop_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shop_transactions
    ADD CONSTRAINT shop_transactions_shop_id_foreign FOREIGN KEY (shop_id) REFERENCES public.player_shops(id) ON DELETE CASCADE;


--
-- Name: skill_milestone_firsts skill_milestone_firsts_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_milestone_firsts
    ADD CONSTRAINT skill_milestone_firsts_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: skill_snapshots skill_snapshots_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_snapshots
    ADD CONSTRAINT skill_snapshots_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: skill_snapshots skill_snapshots_skill_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skill_snapshots
    ADD CONSTRAINT skill_snapshots_skill_id_foreign FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON DELETE CASCADE;


--
-- Name: taler_adjustments taler_adjustments_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_adjustments
    ADD CONSTRAINT taler_adjustments_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE RESTRICT;


--
-- Name: taler_adjustments taler_adjustments_purchase_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_adjustments
    ADD CONSTRAINT taler_adjustments_purchase_id_foreign FOREIGN KEY (purchase_id) REFERENCES public.taler_purchases(id) ON DELETE RESTRICT;


--
-- Name: taler_ledger taler_ledger_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_ledger
    ADD CONSTRAINT taler_ledger_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE RESTRICT;


--
-- Name: taler_purchases taler_purchases_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.taler_purchases
    ADD CONSTRAINT taler_purchases_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE RESTRICT;


--
-- Name: tally_boards tally_boards_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tally_boards
    ADD CONSTRAINT tally_boards_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: tally_boards tally_boards_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tally_boards
    ADD CONSTRAINT tally_boards_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: tanning_jobs tanning_jobs_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanning_jobs
    ADD CONSTRAINT tanning_jobs_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: tanning_jobs tanning_jobs_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanning_jobs
    ADD CONSTRAINT tanning_jobs_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: tanning_jobs tanning_jobs_recipe_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tanning_jobs
    ADD CONSTRAINT tanning_jobs_recipe_id_foreign FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: trade_gold trade_gold_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_gold
    ADD CONSTRAINT trade_gold_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: trade_gold trade_gold_trade_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_gold
    ADD CONSTRAINT trade_gold_trade_id_foreign FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE;


--
-- Name: trade_offers trade_offers_item_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_offers
    ADD CONSTRAINT trade_offers_item_id_foreign FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: trade_offers trade_offers_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_offers
    ADD CONSTRAINT trade_offers_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: trade_offers trade_offers_trade_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trade_offers
    ADD CONSTRAINT trade_offers_trade_id_foreign FOREIGN KEY (trade_id) REFERENCES public.trades(id) ON DELETE CASCADE;


--
-- Name: trades trades_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: trades trades_player1_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_player1_id_foreign FOREIGN KEY (player1_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: trades trades_player2_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_player2_id_foreign FOREIGN KEY (player2_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: trap_targets trap_targets_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_targets
    ADD CONSTRAINT trap_targets_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: trap_targets trap_targets_trap_type_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trap_targets
    ADD CONSTRAINT trap_targets_trap_type_id_foreign FOREIGN KEY (trap_type_id) REFERENCES public.trap_types(id) ON DELETE CASCADE;


--
-- Name: travel_log travel_log_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_log
    ADD CONSTRAINT travel_log_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: warnings warnings_issued_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_issued_by_foreign FOREIGN KEY (issued_by) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: warnings warnings_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warnings
    ADD CONSTRAINT warnings_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: workstation_slots workstation_slots_workstation_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstation_slots
    ADD CONSTRAINT workstation_slots_workstation_id_foreign FOREIGN KEY (workstation_id) REFERENCES public.workstations(id) ON DELETE CASCADE;


--
-- Name: workstations workstations_location_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_location_id_foreign FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: workstations workstations_player_id_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workstations
    ADD CONSTRAINT workstations_player_id_foreign FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


