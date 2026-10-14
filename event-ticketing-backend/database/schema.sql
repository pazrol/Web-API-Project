-- =========================================================
-- EVENT TICKETING AND VENUE BOOKING SYSTEM
-- =========================================================

CREATE DATABASE IF NOT EXISTS event_ticketing
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE event_ticketing;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS event_categories;
DROP TABLE IF EXISTS venue_unavailability;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'organiser', 'customer') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE venues (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    capacity INT UNSIGNED NOT NULL,
    description TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_venue_capacity CHECK (capacity > 0),
    CONSTRAINT fk_venue_created_by FOREIGN KEY (created_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_venues_created_by (created_by)
) ENGINE=InnoDB;

-- Only unavailable/occupied intervals are stored. No record means there is no saved block.
CREATE TABLE venue_unavailability (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_id INT UNSIGNED NOT NULL,
    booked_by INT UNSIGNED NULL,
    unavailability_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    record_type ENUM('admin_block', 'organiser_booking') NOT NULL DEFAULT 'admin_block',
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_unavailability_time CHECK (end_time > start_time),
    CONSTRAINT fk_unavailability_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_unavailability_booked_by FOREIGN KEY (booked_by) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_unavailability_venue_date (venue_id, unavailability_date),
    INDEX idx_unavailability_booked_by (booked_by),
    INDEX idx_unavailability_record_type (record_type)
) ENGINE=InnoDB;

CREATE TABLE event_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    category_id INT UNSIGNED NOT NULL,
    venue_id INT UNSIGNED NOT NULL,
    organiser_id INT UNSIGNED NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    ticket_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_tickets INT UNSIGNED NOT NULL,
    available_tickets INT UNSIGNED NOT NULL,
    status ENUM('upcoming', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_event_datetime CHECK (end_datetime > start_datetime),
    CONSTRAINT chk_event_ticket_price CHECK (ticket_price >= 0),
    CONSTRAINT chk_event_total_tickets CHECK (total_tickets > 0),
    CONSTRAINT chk_event_available_tickets CHECK (available_tickets <= total_tickets),
    CONSTRAINT fk_event_category FOREIGN KEY (category_id) REFERENCES event_categories(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_event_venue FOREIGN KEY (venue_id) REFERENCES venues(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_event_organiser FOREIGN KEY (organiser_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_events_category (category_id),
    INDEX idx_events_venue (venue_id),
    INDEX idx_events_organiser (organiser_id),
    INDEX idx_events_status (status),
    INDEX idx_events_start_datetime (start_datetime)
) ENGINE=InnoDB;

CREATE TABLE bookings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_code VARCHAR(50) NOT NULL UNIQUE,
    event_id INT UNSIGNED NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP NULL,
    cancellation_reason VARCHAR(255) NULL,
    CONSTRAINT chk_booking_quantity CHECK (quantity > 0),
    CONSTRAINT chk_booking_amount CHECK (total_amount >= 0),
    CONSTRAINT fk_booking_event FOREIGN KEY (event_id) REFERENCES events(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_booking_customer FOREIGN KEY (customer_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_bookings_event (event_id),
    INDEX idx_bookings_customer (customer_id),
    INDEX idx_bookings_status (status)
) ENGINE=InnoDB;

CREATE TABLE payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL UNIQUE,
    payment_reference VARCHAR(100) NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    payment_method ENUM('credit_card', 'debit_card', 'online_banking', 'e_wallet') NOT NULL,
    payment_status ENUM('pending', 'paid', 'failed', 'refund_pending', 'refunded') NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMP NULL,
    refunded_at TIMESTAMP NULL,
    refund_amount DECIMAL(10,2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_amount CHECK (amount >= 0),
    CONSTRAINT chk_refund_amount CHECK (refund_amount IS NULL OR refund_amount >= 0),
    CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_payments_status (payment_status)
) ENGINE=InnoDB;

CREATE TABLE notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sender_id INT UNSIGNED NULL,
    recipient_id INT UNSIGNED NOT NULL,
    event_id INT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    notification_type ENUM('general', 'booking_confirmed', 'booking_cancelled', 'event_updated', 'event_cancelled', 'event_reminder', 'payment', 'refund') NOT NULL DEFAULT 'general',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_sender FOREIGN KEY (sender_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_notification_event FOREIGN KEY (event_id) REFERENCES events(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    INDEX idx_notifications_recipient (recipient_id, is_read),
    INDEX idx_notifications_event (event_id)
) ENGINE=InnoDB;

-- =========================================================
-- SAMPLE DATA
-- Demo passwords are: password123
-- =========================================================

INSERT INTO users (name, email, password, role) VALUES
('Admin', 'admin@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'admin'),
('Aiman Rahman', 'organiser1@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'organiser'),
('Nur Aisyah', 'organiser2@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'organiser'),
('Daniel Tan', 'customer1@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'customer'),
('Siti Aminah', 'customer2@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'customer'),
('Kumar Raj', 'customer3@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'customer'),
('Mei Ling', 'customer4@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'customer'),
('Farah Nadia', 'customer5@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'customer'),
('Adam Lee', 'customer6@example.com', '$2y$12$rUT1JJc7LLheNWA13eY.EefdrCHSUGUJ9/q9BKKCFZu3ddpZprf3S', 'customer');


INSERT INTO venues (name, address, capacity, description) VALUES
('Idea Live Arena', 'Level 2, 3 Damansara, 3, Jalan SS20/27, Jln Damansara, Damansara Intan, 47400 Petaling Jaya, Selangor', 500, 'Main hall for conferences and university events.'),
('Megastar Arena', '1F, Sungei Wang Plaza, 3, Jalan Bulan 2, Bukit Bintang, 55100 Kuala Lumpur, Federal Territory of Kuala Lumpur', 350, 'Flexible hall for technology showcases and seminars.'),
('UPTM GrandHall', 'UPTM Kuala Lumpur', 100, 'Small room for training and workshops.'),
('Convention Hall', 'Cheras, Kuala Lumpur', 800, 'Large indoor hall for exhibitions and conventions.'),
('Garden Event Space', 'Bandar Tun Hussein Onn, Selangor', 250, 'Open-air event space for community programmes.'),
('Creative Studio Hall', 'Taman Connaught, Kuala Lumpur', 180, 'Compact venue for creative workshops and presentations.');

INSERT INTO venue_unavailability
(venue_id, unavailability_date, start_time, end_time, record_type, booked_by, reason)
VALUES
(1, '2026-11-02', '09:00:00', '17:00:00', 'admin_block', NULL, 'Scheduled venue maintenance'),
(2, '2026-11-03', '08:00:00', '12:00:00', 'admin_block', NULL, 'Electrical inspection'),
(3, '2026-11-04', '13:00:00', '18:00:00', 'admin_block', NULL, 'Cleaning and maintenance'),
(4, '2026-11-06', '09:00:00', '17:00:00', 'admin_block', NULL, 'Private function preparation'),
(5, '2026-11-08', '10:00:00', '16:00:00', 'admin_block', NULL, 'Venue maintenance'),
(6, '2026-11-10', '09:00:00', '13:00:00', 'organiser_booking', 3, 'Hall reservation by Nur Aisyah');

INSERT INTO event_categories (category_name, description) VALUES
('Technology', 'Technology, innovation and digital skills events.'),
('Education', 'Seminars, lectures and learning workshops.'),
('Music', 'Live performances and music gatherings.'),
('Sports', 'Sports, fitness and recreation events.'),
('Community', 'Community, charity and social programmes.'),
('Business', 'Business networking and entrepreneurship events.');

INSERT INTO events
(title, description, category_id, venue_id, organiser_id, start_datetime, end_datetime, ticket_price, total_tickets, available_tickets, status)
VALUES
('Cyber Security Seminar 2026', 'Practical talks about online safety, cyber threats and digital security.', 1, 1, 2, '2026-11-05 10:00:00', '2026-11-05 13:00:00', 25.00, 120, 118, 'upcoming'),
('Future Skills Workshop', 'A hands-on workshop about digital tools and career-ready skills.', 2, 2, 3, '2026-11-07 09:30:00', '2026-11-07 12:30:00', 15.00, 80, 79, 'upcoming'),
('Kuala Lumpur Acoustic Night', 'An evening performance featuring local acoustic artists.', 3, 3, 2, '2026-11-09 19:00:00', '2026-11-09 22:00:00', 25.00, 200, 200, 'upcoming'),
('Community Sports Day', 'A friendly community event with team games and activities.', 4, 4, 3, '2026-11-11 08:30:00', '2026-11-11 16:00:00', 30.00, 100, 100, 'upcoming'),
('Cheras Community Care', 'A community programme with volunteering and local outreach activities.', 5, 5, 2, '2026-11-13 10:00:00', '2026-11-13 15:00:00', 20.00, 150, 149, 'upcoming'),
('Young Entrepreneurs Meetup', 'Networking and idea-sharing for students and new entrepreneurs.', 6, 6, 3, '2026-11-15 14:00:00', '2026-11-15 17:00:00', 25.00, 90, 88, 'upcoming');

INSERT INTO bookings
(booking_code, event_id, customer_id, quantity, total_amount, status, cancelled_at)
VALUES
('BK-T4U-2026-0001', 1, 4, 2, 50.00, 'confirmed', NULL),
('BK-T4U-2026-0002', 2, 5, 1, 15.00, 'confirmed', NULL),
('BK-T4U-2026-0003', 3, 6, 3, 75.00, 'pending', NULL),
('BK-T4U-2026-0004', 4, 7, 2, 60.00, 'cancelled', NOW()),
('BK-T4U-2026-0005', 5, 8, 1, 20.00, 'confirmed', NULL),
('BK-T4U-2026-0006', 6, 9, 2, 50.00, 'confirmed', NULL);


INSERT INTO payments
    (booking_id, payment_reference, amount, payment_method, payment_status,
     paid_at, refunded_at, refund_amount)
VALUES
    (1, 'T4U-PAY-2026-0001', 50.00, 'e_wallet', 'paid', NOW(), NULL, NULL),
    (2, 'T4U-PAY-2026-0002', 15.00, 'online_banking', 'paid', NOW(), NULL, NULL),
    (3, 'T4U-PAY-2026-0003', 75.00, 'credit_card', 'pending', NULL, NULL, NULL),
    (4, 'T4U-PAY-2026-0004', 60.00, 'e_wallet', 'refund_pending', NOW(), NULL, NULL),
    (5, 'T4U-PAY-2026-0005', 20.00, 'debit_card', 'paid', NOW(), NULL, NULL),
    (6, 'T4U-PAY-2026-0006', 50.00, 'online_banking', 'paid', NOW(), NULL, NULL);

INSERT INTO notifications
(sender_id, recipient_id, title, message, notification_type, event_id, is_read)
VALUES
(2, 4, 'Cyber Security Seminar Reminder', 'Your booked seminar is coming up on 5 November 2026.', 'event_reminder', 1, 0),
(3, 5, 'Future Skills Workshop', 'Your workshop booking is confirmed. Please arrive 15 minutes early.', 'booking_confirmed', 2, 0),
(2, 6, 'Kuala Lumpur Acoustic Night', 'Your booking request is currently pending payment.', 'general', 3, 0),
(1, 7, 'Refund Processing Update', 'Your cancelled booking refund is waiting for processing.', 'booking_cancelled', 4, 0),
(2, 8, 'Community Care Programme', 'Thank you for registering for the community programme.', 'booking_confirmed', 5, 1),
(3, 9, 'Entrepreneurs Meetup', 'Your ticket is confirmed. We look forward to seeing you.', 'booking_confirmed', 6, 0);

-- =========================================================
-- VERIFY SAMPLE COUNTS
-- =========================================================
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'venues', COUNT(*) FROM venues
UNION ALL SELECT 'event_categories', COUNT(*) FROM event_categories
UNION ALL SELECT 'events', COUNT(*) FROM events
UNION ALL SELECT 'venue_unavailability', COUNT(*) FROM venue_unavailability
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications;