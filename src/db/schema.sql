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


