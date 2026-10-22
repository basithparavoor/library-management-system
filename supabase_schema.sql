-- =============================================================================
-- TGI INSTITUTIONAL ERP & SCHOOL LIBRARY MANAGEMENT SYSTEM
-- COMPLETE IDEMPOTENT & TYPE-SAFE SUPABASE POSTGRESQL SCHEMA
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. SYSTEM CONFIGURATION & CIRCULATION RULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS library_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure newly added columns exist if table was already created in earlier migrations
ALTER TABLE library_settings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE library_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

INSERT INTO library_settings (setting_key, setting_value, description)
VALUES
    ('loan_days', '14', 'Default loan period in days'),
    ('fine_amount', '2.00', 'Daily overdue penalty in local currency'),
    ('max_books', '3', 'Maximum books permitted per student at one time'),
    ('max_renewals', '1', 'Maximum allowable renewals per loan')
ON CONFLICT (setting_key) DO UPDATE SET 
    setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- =============================================================================
-- 2. INSTITUTIONAL MULTI-CAMPUS HIERARCHY & MASTER DATA
-- =============================================================================

-- Institution Global Profile & Branding
CREATE TABLE IF NOT EXISTS institution_profile (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'primary_institution',
    name VARCHAR(255) NOT NULL DEFAULT 'INSTITUTION NAME',
    tagline VARCHAR(255) DEFAULT 'ERP & Library Management Suite',
    reg_code VARCHAR(100) DEFAULT 'REG-2026-001',
    established_year VARCHAR(50) DEFAULT '1998',
    email VARCHAR(255) DEFAULT 'admin@institution.edu',
    phone VARCHAR(50) DEFAULT '+1 555-0100',
    website VARCHAR(255) DEFAULT '',
    address TEXT DEFAULT 'Main Campus Headquarters',
    logo_url TEXT,
    favicon_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE institution_profile ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE institution_profile ADD COLUMN IF NOT EXISTS favicon_url TEXT;

INSERT INTO institution_profile (id, name, tagline, reg_code, established_year, email, phone, website, address)
VALUES ('primary_institution', 'INSTITUTION NAME', 'ERP & Library Management Suite', 'REG-2026-001', '1998', 'admin@institution.edu', '+1 555-0100', '', 'Main Campus Headquarters')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS campuses (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    city VARCHAR(100),
    head_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    logo_url TEXT,
    wings_count INTEGER DEFAULT 1,
    capacity INTEGER DEFAULT 500,
    established_year VARCHAR(50),
    address TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campuses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS wings_count INTEGER DEFAULT 1;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 500;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS established_year VARCHAR(50);
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE campuses ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';

-- Academic Departments, Degree Programs & Class Sections
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50),
    name VARCHAR(255) UNIQUE NOT NULL,
    hod_name VARCHAR(255),
    email VARCHAR(255),
    intake_capacity INTEGER DEFAULT 120,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS hod_name VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS intake_capacity INTEGER DEFAULT 120;

CREATE TABLE IF NOT EXISTS degree_programs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    degree_level VARCHAR(100) DEFAULT 'Undergraduate (UG)',
    duration_years INTEGER DEFAULT 4,
    credits INTEGER DEFAULT 160,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    code VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    semester VARCHAR(100) DEFAULT 'Semester 1',
    mentor_name VARCHAR(255),
    room_no VARCHAR(100),
    capacity INTEGER DEFAULT 60,
    enrolled_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE classes ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS semester VARCHAR(100) DEFAULT 'Semester 1';
ALTER TABLE classes ADD COLUMN IF NOT EXISTS mentor_name VARCHAR(255);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS room_no VARCHAR(100);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 60;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS enrolled_count INTEGER DEFAULT 0;

-- Library Physical Storage Wings, Shelves & Racks
CREATE TABLE IF NOT EXISTS wings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    floor VARCHAR(100) DEFAULT 'Ground Floor',
    primary_focus VARCHAR(255),
    max_capacity INTEGER DEFAULT 5000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shelves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wing_id UUID REFERENCES wings(id) ON DELETE SET NULL,
    code VARCHAR(50),
    name VARCHAR(255) UNIQUE NOT NULL,
    wing_name VARCHAR(255),
    genre VARCHAR(255),
    tiers INTEGER DEFAULT 5,
    capacity INTEGER DEFAULT 500,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shelves ADD COLUMN IF NOT EXISTS wing_id UUID REFERENCES wings(id) ON DELETE SET NULL;
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS wing_name VARCHAR(255);
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS genre VARCHAR(255);
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS tiers INTEGER DEFAULT 5;
ALTER TABLE shelves ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 500;

CREATE TABLE IF NOT EXISTS racks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shelf_id UUID REFERENCES shelves(id) ON DELETE CASCADE,
    code VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    shelf_name VARCHAR(255),
    row_level VARCHAR(100) DEFAULT 'Tier 1',
    max_slots INTEGER DEFAULT 80,
    stored_books INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE racks ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE racks ADD COLUMN IF NOT EXISTS shelf_name VARCHAR(255);
ALTER TABLE racks ADD COLUMN IF NOT EXISTS row_level VARCHAR(100) DEFAULT 'Tier 1';
ALTER TABLE racks ADD COLUMN IF NOT EXISTS max_slots INTEGER DEFAULT 80;
ALTER TABLE racks ADD COLUMN IF NOT EXISTS stored_books INTEGER DEFAULT 0;

-- =============================================================================
-- 3. STUDENTS, MEMBERS & FACULTY DIRECTORY (TYPE SAFE CONVERSION)
-- =============================================================================

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    place VARCHAR(150),
    class_id VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    nfc_tag_id VARCHAR(100),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    borrow_limit INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely convert class_id column if previously typed as UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'class_id'
    ) THEN
        ALTER TABLE students DROP CONSTRAINT IF EXISTS students_class_id_fkey;
        ALTER TABLE students ALTER COLUMN class_id TYPE VARCHAR(255) USING class_id::text;
    END IF;
END $$;

ALTER TABLE students ADD COLUMN IF NOT EXISTS nfc_tag_id VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE students ADD COLUMN IF NOT EXISTS borrow_limit INTEGER DEFAULT 3;

CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE SET NULL,
    employee_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(150),
    department_id VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'TEACHER',
    nfc_tag_id VARCHAR(100),
    qr_code VARCHAR(100),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely convert department_id column if previously typed as UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'staff' AND column_name = 'department_id'
    ) THEN
        ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_department_id_fkey;
        ALTER TABLE staff ALTER COLUMN department_id TYPE VARCHAR(100) USING department_id::text;
    END IF;
END $$;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS nfc_tag_id VARCHAR(100);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS qr_code VARCHAR(100);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';

-- =============================================================================
-- 4. BOOK CATALOG & COPIES INVENTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100) DEFAULT 'General',
    rack_location VARCHAR(100),
    total_copies INTEGER DEFAULT 1,
    available_copies INTEGER DEFAULT 1,
    cover_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE books ADD COLUMN IF NOT EXISTS rack_location VARCHAR(100);
ALTER TABLE books ADD COLUMN IF NOT EXISTS total_copies INTEGER DEFAULT 1;
ALTER TABLE books ADD COLUMN IF NOT EXISTS available_copies INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS book_copies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    condition VARCHAR(50) DEFAULT 'EXCELLENT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE book_copies ADD COLUMN IF NOT EXISTS condition VARCHAR(50) DEFAULT 'EXCELLENT';

-- =============================================================================
-- 5. CIRCULATION, LOANS & SMART RETURN
-- =============================================================================

CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    copy_id UUID REFERENCES book_copies(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    issue_date TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ NOT NULL,
    return_date TIMESTAMPTZ,
    fine_accrued DECIMAL(10, 2) DEFAULT 0.00,
    renewals_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE loans ADD COLUMN IF NOT EXISTS fine_accrued DECIMAL(10, 2) DEFAULT 0.00;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS renewals_count INTEGER DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE loans ADD COLUMN IF NOT EXISTS return_date TIMESTAMPTZ;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

-- =============================================================================
-- 6. COMPUTERS, LAB WORKSTATION TRACKING & FOCUS LOCK
-- =============================================================================

CREATE TABLE IF NOT EXISTS computers (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    lab_name VARCHAR(150) NOT NULL,
    machine_code VARCHAR(100) UNIQUE NOT NULL,
    ip_address VARCHAR(50),
    specs TEXT,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    current_user_id VARCHAR(100),
    current_user_name VARCHAR(255),
    session_start TIMESTAMPTZ,
    purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS computer_sessions (
    id TEXT PRIMARY KEY,
    computer_id TEXT REFERENCES computers(id) ON DELETE CASCADE,
    machine_code VARCHAR(100) NOT NULL,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    student_id VARCHAR(100) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 0,
    purpose TEXT,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workstation_policies (
    id TEXT PRIMARY KEY DEFAULT 'current_policy',
    active_period_id VARCHAR(100),
    period_name VARCHAR(255),
    class_name VARCHAR(100),
    teacher_name VARCHAR(255),
    allowed_mode VARCHAR(100) DEFAULT 'EXCEL_ONLY',
    allowed_apps JSONB DEFAULT '["Microsoft Excel", "Institutional ERP"]'::jsonb,
    blocked_apps JSONB DEFAULT '["Social Media", "Games", "YouTube", "Chat Apps"]'::jsonb,
    lock_active BOOLEAN DEFAULT TRUE,
    strict_student_assignment BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workstation_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    machine_code VARCHAR(100) NOT NULL,
    student_id VARCHAR(100) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(machine_code)
);

-- =============================================================================
-- 7. CLASS PERIOD ATTENDANCE TRACKER
-- =============================================================================

CREATE TABLE IF NOT EXISTS period_sessions (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    facility_type VARCHAR(100) NOT NULL,
    department_name VARCHAR(150),
    class_name VARCHAR(100) NOT NULL,
    teacher_name VARCHAR(255) NOT NULL,
    period_name VARCHAR(150) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    topic VARCHAR(255),
    total_students INTEGER DEFAULT 0,
    present_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS period_attendance (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES period_sessions(id) ON DELETE CASCADE,
    student_id VARCHAR(100) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PRESENT',
    checkin_method VARCHAR(50) DEFAULT 'NFC',
    checkin_time TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. EVENT HALLS, RESERVATIONS & ATTENDEE SCANNING
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_halls (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    hall_code VARCHAR(100) UNIQUE NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 100,
    location VARCHAR(255),
    amenities TEXT,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    hall_id TEXT REFERENCES event_halls(id) ON DELETE SET NULL,
    hall_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    organizer_name VARCHAR(255),
    conductor_name VARCHAR(255) NOT NULL,
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    expected_attendees INTEGER DEFAULT 100,
    registered_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_attendees (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    member_id VARCHAR(100) NOT NULL,
    member_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'STUDENT',
    ticket_code VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'REGISTERED',
    checkin_time TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 9. FACILITY REQUESTS & DEAN APPROVALS WORKFLOW
-- =============================================================================

CREATE TABLE IF NOT EXISTS facility_requests (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    requester_name VARCHAR(255) NOT NULL,
    role VARCHAR(100),
    facility_type VARCHAR(100) NOT NULL,
    target_date DATE NOT NULL,
    period_time VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    approved_by VARCHAR(255),
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- =============================================================================
-- 10. NOTIFICATIONS, MESSENGER & PUSH ALERTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    campus_id VARCHAR(100) DEFAULT 'ALL',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'INFO',
    link VARCHAR(255),
    action_link TEXT,
    target_audience VARCHAR(100) DEFAULT 'ALL',
    target_role VARCHAR(100) DEFAULT 'ALL',
    priority VARCHAR(50) DEFAULT 'NORMAL',
    unread BOOLEAN DEFAULT TRUE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS campus_id VARCHAR(100) DEFAULT 'ALL';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'INFO';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_link TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_audience VARCHAR(100) DEFAULT 'ALL';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_role VARCHAR(100) DEFAULT 'ALL';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'NORMAL';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS unread BOOLEAN DEFAULT TRUE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS chat_channels (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    role VARCHAR(50) NOT NULL,
    avatar VARCHAR(100),
    last_message TEXT,
    last_time TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO chat_channels (id, name, description, role, avatar, last_message)
VALUES
    ('ch-admin', 'Executive Admin & Helpdesk', 'Direct desk with Super Admin & Campus Deans', 'ADMIN', 'shield', 'Channel active and ready for inquiries.'),
    ('ch-library', 'Chief Librarian Desk', 'Book renewals, shelf reservations & catalog queries', 'LIBRARIAN', 'book-open', 'Channel active for circulation support.'),
    ('ch-lab', 'Lab Hardware Support', 'Workstation issues, software licenses & GPU access', 'LAB_ADMIN', 'monitor', 'Channel active for workstation assistance.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT REFERENCES chat_channels(id) ON DELETE CASCADE,
    sender_id VARCHAR(100) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    sender_role VARCHAR(50) NOT NULL,
    text TEXT NOT NULL,
    is_outgoing BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 11. ENTRANCE VERIFICATION HALL PASSES & TRUANCY AUDIT
-- =============================================================================

CREATE TABLE IF NOT EXISTS hall_passes (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    student_id VARCHAR(100) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    teacher_name VARCHAR(255) NOT NULL,
    origin_class VARCHAR(150) NOT NULL,
    reason VARCHAR(255),
    duration_minutes INTEGER DEFAULT 15,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_arrival_at TIMESTAMPTZ NOT NULL,
    verified_arrival_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'IN_TRANSIT',
    flagged_truant BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 12. READING LOGS, CLASSROOM SETS & INTER-CAMPUS TRANSFERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS reading_logs (
    id TEXT PRIMARY KEY,
    student_id VARCHAR(100) NOT NULL,
    student_name VARCHAR(255) NOT NULL,
    book_title VARCHAR(255) NOT NULL,
    pages_read INTEGER DEFAULT 10,
    minutes_spent INTEGER DEFAULT 30,
    feedback TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_sets (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    teacher_id VARCHAR(100) NOT NULL,
    teacher_name VARCHAR(255) NOT NULL,
    set_title VARCHAR(255) NOT NULL,
    copies_count INTEGER DEFAULT 30,
    grade_class VARCHAR(100) NOT NULL,
    borrow_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    return_date DATE,
    status VARCHAR(50) DEFAULT 'BORROWED_FOR_CLASS',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campus_transfers (
    id TEXT PRIMARY KEY,
    from_campus TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    to_campus TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    book_title VARCHAR(255) NOT NULL,
    quantity INTEGER DEFAULT 1,
    requested_by VARCHAR(255) NOT NULL,
    reason TEXT,
    status VARCHAR(50) DEFAULT 'IN_TRANSIT_COURIER',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS damage_incidents (
    id TEXT PRIMARY KEY,
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    barcode VARCHAR(100) NOT NULL,
    book_title VARCHAR(255) NOT NULL,
    student_id VARCHAR(100),
    student_name VARCHAR(255),
    damage_type VARCHAR(100) NOT NULL,
    notes TEXT,
    resolution VARCHAR(100) DEFAULT 'REPLACEMENT_PENDING',
    reported_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 13. TTS READ-ALOUD & ACCESSIBILITY STATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS audio_books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    full_text TEXT NOT NULL,
    reading_level VARCHAR(50) DEFAULT 'Intermediate',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tts_reading_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id VARCHAR(100),
    audio_book_id UUID REFERENCES audio_books(id) ON DELETE SET NULL,
    duration_seconds INTEGER DEFAULT 0,
    speed_rate DECIMAL(3, 2) DEFAULT 1.00,
    voice_selected VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 14. CUSTOM KEYBOARD SHORTCUTS & HARDWARE SYNC
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_shortcuts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100) NOT NULL,
    action_id VARCHAR(100) NOT NULL,
    key_combo VARCHAR(50) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, action_id)
);

CREATE TABLE IF NOT EXISTS hardware_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campus_id TEXT REFERENCES campuses(id) ON DELETE CASCADE,
    device_name VARCHAR(150) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'ONLINE',
    last_ping TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nfc_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tag_uid VARCHAR(100) UNIQUE NOT NULL,
    tech_type VARCHAR(50) DEFAULT 'NTAG215',
    member_id VARCHAR(100),
    member_name VARCHAR(255),
    member_role VARCHAR(50) DEFAULT 'STUDENT',
    barcode VARCHAR(100),
    campus_id TEXT REFERENCES campuses(id) ON DELETE SET NULL,
    clearances JSONB DEFAULT '["Turnstile Gate", "Library Desk", "Digital Research Lab"]'::jsonb,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS id_card_templates (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    orientation VARCHAR(50) DEFAULT 'landscape',
    width_mm DECIMAL(6, 2) DEFAULT 85.60,
    height_mm DECIMAL(6, 2) DEFAULT 53.98,
    theme_color VARCHAR(50) DEFAULT '#3b82f6',
    accent_color VARCHAR(50) DEFAULT '#1e3a8a',
    layout_config JSONB,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 15. ROLE-BASED ACCESS CONTROL (RBAC) & PRIVILEGED ADMIN ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS permissions (
    role VARCHAR(50) PRIMARY KEY,
    can_view_all_campuses BOOLEAN DEFAULT FALSE,
    can_manage_catalog BOOLEAN DEFAULT FALSE,
    can_manage_circulation BOOLEAN DEFAULT FALSE,
    can_manage_members BOOLEAN DEFAULT FALSE,
    can_manage_labs BOOLEAN DEFAULT FALSE,
    can_take_attendance BOOLEAN DEFAULT FALSE,
    can_manage_events BOOLEAN DEFAULT FALSE,
    can_approve_requests BOOLEAN DEFAULT FALSE,
    can_access_reports BOOLEAN DEFAULT FALSE,
    can_configure_rbac BOOLEAN DEFAULT FALSE
);

INSERT INTO permissions (role, can_view_all_campuses, can_manage_catalog, can_manage_circulation, can_manage_members, can_manage_labs, can_take_attendance, can_manage_events, can_approve_requests, can_access_reports, can_configure_rbac)
VALUES
    ('SUPER_ADMIN', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('INSTITUTION_HEAD', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
    ('CAMPUS_HEAD', FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE),
    ('TEACHER', FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, FALSE, FALSE),
    ('LIBRARIAN', FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('LAB_ADMIN', FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('EVENT_CONDUCTOR', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE),
    ('STUDENT', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role) DO UPDATE SET can_view_all_campuses = EXCLUDED.can_view_all_campuses;

-- Privileged Admin Accounts Delegated Under Super Admin
CREATE TABLE IF NOT EXISTS admin_accounts (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'SYSTEM_ADMIN',
    campus_id VARCHAR(100) DEFAULT 'ALL',
    designation VARCHAR(150) DEFAULT 'System Administrator',
    status VARCHAR(50) DEFAULT 'ACTIVE',
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'SYSTEM_ADMIN';
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS campus_id VARCHAR(100) DEFAULT 'ALL';
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS designation VARCHAR(150) DEFAULT 'System Administrator';
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;

INSERT INTO admin_accounts (id, name, email, role, campus_id, designation, status, password_hash)
VALUES ('admin-root', 'Super Administrator', 'admin@tgi.edu', 'SUPER_ADMIN', 'ALL', 'Chief System Director & Superadmin', 'ACTIVE', 'admin')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

-- 2. User Profile Directory for Auth Mapping (Supports both Supabase Auth UUIDs & Custom Admin IDs)
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email VARCHAR(255),
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'SUPER ADMIN',
    campus_id VARCHAR(100) DEFAULT 'ALL',
    is_superadmin BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely convert profiles.id to TEXT if it was previously created as UUID
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id' AND data_type = 'uuid'
    ) THEN
        ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
        ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey CASCADE;
        ALTER TABLE profiles ALTER COLUMN id TYPE TEXT USING id::text;
        ALTER TABLE profiles ADD PRIMARY KEY (id);
    END IF;
END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'SUPER ADMIN';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS campus_id VARCHAR(100) DEFAULT 'ALL';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT TRUE;

INSERT INTO profiles (id, email, name, role, campus_id, is_superadmin)
VALUES ('admin-root', 'admin@tgi.edu', 'Super Administrator', 'SUPER ADMIN', 'ALL', TRUE)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

-- =============================================================================
-- 16. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE library_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE degree_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE wings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE computers ENABLE ROW LEVEL SECURITY;
ALTER TABLE computer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_halls ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hall_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE campus_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE tts_reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_shortcuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Grant Full Open Access for Web Client Operations
DO $$ 
DECLARE
    tbl text;
BEGIN
    FOR tbl IN 
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN (
            'library_settings', 'institution_profile', 'campuses', 'departments', 'degree_programs', 'classes', 'wings', 'shelves', 'racks',
            'students', 'staff', 'books', 'book_copies', 'loans', 'computers', 'computer_sessions', 
            'workstation_policies', 'workstation_assignments', 'period_sessions', 
            'period_attendance', 'event_halls', 'events', 'event_attendees', 
            'facility_requests', 'notifications', 'chat_channels', 'chat_messages', 
            'hall_passes', 'reading_logs', 'classroom_sets', 'campus_transfers', 
            'damage_incidents', 'audio_books', 'tts_reading_sessions', 'user_shortcuts', 
            'hardware_devices', 'nfc_tags', 'id_card_templates', 'permissions',
            'admin_accounts', 'profiles'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public Full Access" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "Public Full Access" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

-- =============================================================================
-- 17. PERFORMANCE OPTIMIZATION INDEXES & REALTIME
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);
CREATE INDEX IF NOT EXISTS idx_copies_barcode ON book_copies(barcode);
CREATE INDEX IF NOT EXISTS idx_loans_student_status ON loans(student_id, status);
CREATE INDEX IF NOT EXISTS idx_computers_campus ON computers(campus_id);
CREATE INDEX IF NOT EXISTS idx_comp_sessions_student ON computer_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_period_sessions_date ON period_sessions(date);
CREATE INDEX IF NOT EXISTS idx_event_attendees_ticket ON event_attendees(ticket_code);
CREATE INDEX IF NOT EXISTS idx_hallpasses_student ON hall_passes(student_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_user_shortcuts_user ON user_shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_uid ON nfc_tags(tag_uid);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_barcode ON nfc_tags(barcode);
CREATE INDEX IF NOT EXISTS idx_admin_accounts_email ON admin_accounts(email);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Enable Realtime Publication for key reactive tables
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_accounts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
