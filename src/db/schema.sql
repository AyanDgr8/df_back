-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_name ENUM('super_admin', 'it_admin', 'business_head', 'team_leader', 'user') NOT NULL
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    permission_name VARCHAR(50) NOT NULL UNIQUE
);

-- Create user_roles table
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    team_id INT,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Create user_permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    permission_id INT NOT NULL,
    value BOOLEAN DEFAULT false,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id),
    UNIQUE KEY unique_user_permission (user_id, permission_id)
);

-- Insert default roles
INSERT INTO roles (role_name) VALUES 
('super_admin'),
('it_admin'),
('business_head'),
('team_leader'),
('user');

-- Insert default permissions
INSERT INTO permissions (permission_name) VALUES 
('upload_document'),
('download_data'),
('create_customer'),
('edit_customer'),
('delete_customer'),
('view_customer'),
('view_team_customers'),
('view_assigned_customers');

-- Create default super_admin user
INSERT INTO users (username, email, password, role_id) VALUES 
('super_admin', 'super_admin@example.com', '$2b$10$3Pm0R8iJXyULx.PX2GHWZOlhE/vHXYJzIBk/ThJzJoRSTB3sgN.Gy', 1);

-- Create default it_admin user
INSERT INTO users (username, email, password, role_id) VALUES 
('it_admin', 'it_admin@example.com', '$2b$10$3Pm0R8iJXyULx.PX2GHWZOlhE/vHXYJzIBk/ThJzJoRSTB3sgN.Gy', 2);

-- Create default business_head user
INSERT INTO users (username, email, password, role_id) VALUES 
('business_head', 'business_head@example.com', '$2b$10$3Pm0R8iJXyULx.PX2GHWZOlhE/vHXYJzIBk/ThJzJoRSTB3sgN.Gy', 3);


CREATE TABLE `login_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `device_id` varchar(255) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `login_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `login_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

****************************

****************************


****************************


-- 1. Create permissions
CREATE TABLE IF NOT EXISTS permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    permission_name VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Create roles
CREATE TABLE IF NOT EXISTS roles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    role_name ENUM('super_admin', 'it_admin', 'business_head', 'team_leader', 'user') NOT NULL
);

-- 3. Create teams (temporarily without the foreign key to users)
CREATE TABLE IF NOT EXISTS teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_name VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT NOT NULL
    -- FOREIGN KEY (created_by) REFERENCES users(id)  -- Add this later
);

-- 4. Create users
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    team_id INT,
    role_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
);


ALTER TABLE users ADD UNIQUE (username);



-- 5. Alter teams table to add foreign key now that users table exists
ALTER TABLE teams
ADD CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES users(id);

-- 6. Create user_permissions
CREATE TABLE IF NOT EXISTS user_permissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    permission_id INT NOT NULL,
    value BOOLEAN DEFAULT false,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id),
    UNIQUE KEY unique_user_permission (user_id, permission_id)
);

-- Insert default roles
INSERT INTO roles (role_name) VALUES 
('super_admin'),
('it_admin'),
('business_head'),
('team_leader'),
('user');


-- Insert default permissions
INSERT INTO permissions (permission_name) VALUES 
('upload_document'),
('download_data'),
('create_customer'),
('edit_customer'),
('delete_customer'),
('view_customer'),
('view_team_customers'),
('view_assigned_customers');





7.
CREATE TABLE `login_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `device_id` varchar(255) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `login_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_time` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `login_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1223 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci


The following means :
('upload_document'), can upload the document
('download_data'), can download the document 
('create_customer'), can create a new record 
('edit_customer'), can edit the record 
('delete_customer'), can delete a record 
('view_customer'), can view all customers of the team
('view_team_customers'), can view all customers assigned to him

instead of being unique usernames just interlink the agent_name 

8.
CREATE TABLE `customers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `loan_card_no` varchar(25) DEFAULT NULL,
   `c_name` varchar(30) DEFAULT NULL,
   `product` VARCHAR(15) DEFAULT NULL
  `CRN` bigint(15) DEFAULT NULL,
  `bank_name` varchar(20) DEFAULT NULL,
  `banker_name` varchar(20) DEFAULT NULL,
  `agent_name` varchar(20) DEFAULT NULL,
  `tl_name` varchar(20) DEFAULT NULL,
  `fl_supervisor` varchar(20) DEFAULT NULL,
  `DPD_vintage` varchar(10) DEFAULT NULL,
  `POS` bigint(15) DEFAULT NULL,
  `emi_AMT` bigint(10) DEFAULT NULL,
  `loan_AMT` bigint(10) DEFAULT NULL,
  `paid_AMT` bigint(10) DEFAULT NULL,

  `settl_AMT` bigint(10) DEFAULT NULL,
  `shots` bigint(3) DEFAULT NULL,
  `resi_address` varchar(150) DEFAULT NULL,
  `pincode` bigint(6) DEFAULT NULL,
  `office_address` varchar(150) DEFAULT NULL,
  `mobile` bigint(20) DEFAULT NULL,
  `ref_mobile` bigint(20) DEFAULT NULL,
  `calling_code` enum('WN', 'NC', 'CB', 'PTP', 'RTP') DEFAULT 'WN',
  `calling_feedback` varchar(150) DEFAULT NULL,
  `field_feedback` varchar(150) DEFAULT NULL,
  `new_track_no` bigint(30) DEFAULT NULL,
  `field_code` enum('ANF', 'SKIP', 'RTP', 'REVISIT', 'PTP') DEFAULT 'ANF',
  `C_unique_id` varchar(10) DEFAULT NULL,
 `date_created` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
`last_updated` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  PRIMARY KEY (`id`),
  UNIQUE KEY `C_unique_id` (`C_unique_id`),
  KEY `fk_agent_name_username` (`agent_name`),
  CONSTRAINT `fk_agent_name_username` FOREIGN KEY (`agent_name`) REFERENCES `users` (`username`) ON DELETE SET NULL ON UPDATE CASCADE
);


ALTER TABLE `customers`
ADD COLUMN `scheduled_at` DATETIME DEFAULT NULL;


9.
CREATE TABLE `updates_customer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `C_unique_id` varchar(10) NOT NULL,
  `field` varchar(255) NOT NULL,
  `old_value` text,
  `new_value` text,
  `changed_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `phone_no_primary` varchar(15) DEFAULT NULL,
  `changed_by` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `updates_customer_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)
) ;


ALTER TABLE customers
ADD COLUMN mobile_3 BIGINT(20) DEFAULT NULL AFTER ref_mobile,
ADD COLUMN mobile_4 BIGINT(20) DEFAULT NULL AFTER mobile_3,
ADD COLUMN mobile_5 BIGINT(20) DEFAULT NULL AFTER mobile_4,
ADD COLUMN mobile_6 BIGINT(20) DEFAULT NULL AFTER mobile_5,
ADD COLUMN mobile_7 BIGINT(20) DEFAULT NULL AFTER mobile_6,
ADD COLUMN mobile_8 BIGINT(20) DEFAULT NULL AFTER mobile_7;

