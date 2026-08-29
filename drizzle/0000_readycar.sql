CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`vehicle` text NOT NULL,
	`plate` text NOT NULL,
	`expiration_date` text NOT NULL,
	`file_name` text,
	`file_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_documents_expiration_date` ON `documents` (`expiration_date`);
