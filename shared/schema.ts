import { sql } from "drizzle-orm";
import { 
  index,
  jsonb,
  pgTable, 
  text, 
  varchar, 
  timestamp, 
  integer, 
  real,
  customType
} from "drizzle-orm/pg-core";

// Define bytea type for binary data storage
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
  fromDriver(value: Buffer): Buffer {
    return value;
  },
});

// Define vector type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Folders table for hierarchical organization
export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id"), // Self-reference - will add FK later
  path: text("path").notNull(), // Full path like "/Documents/Work/Projects"
  color: text("color"), // Optional folder color
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  objectPath: text("object_path").notNull(),
  // fileData: bytea("file_data"), // REMOVED - now in files_internal table only
  folderId: varchar("folder_id").references(() => folders.id, { onDelete: "set null" }), // Files can exist without folders (root level)
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
  storageType: varchar("storage_type").default("dual"), // dual: both database and cloud storage
  processingStatus: text("processing_status").notNull().default("pending"), // pending, processing, completed, error
  processingError: text("processing_error"),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const fileMetadata = pgTable("file_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileId: varchar("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  summary: text("summary"),
  keywords: text("keywords").array(),
  topics: text("topics").array(),
  categories: text("categories").array(),
  extractedText: text("extracted_text"),
  embedding: real("embedding").array(), // Legacy - keeping for migration
  embeddingVector: vector("embedding_vector"), // New optimized vector column
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const searchHistory = pgTable("search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  query: text("query").notNull(),
  results: jsonb("results"),
  searchedAt: timestamp("searched_at").defaultNow().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  uploadedAt: true,
  processedAt: true,
});

export const insertFileMetadataSchema = createInsertSchema(fileMetadata).omit({
  id: true,
  createdAt: true,
});

export const insertSearchHistorySchema = createInsertSchema(searchHistory).omit({
  id: true,
  searchedAt: true,
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Relations
import { relations } from "drizzle-orm";

export const usersRelations = relations(users, ({ many }) => ({
  files: many(files),
  folders: many(folders),
  searchHistory: many(searchHistory),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  parent: one(folders, { fields: [folders.parentId], references: [folders.id] }),
  children: many(folders),
  files: many(files),
  user: one(users, { fields: [folders.userId], references: [users.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  folder: one(folders, { fields: [files.folderId], references: [folders.id] }),
  user: one(users, { fields: [files.userId], references: [users.id] }),
  metadata: one(fileMetadata, { fields: [files.id], references: [fileMetadata.fileId] }),
}));

export const fileMetadataRelations = relations(fileMetadata, ({ one }) => ({
  file: one(files, { fields: [fileMetadata.fileId], references: [files.id] }),
}));

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, { fields: [searchHistory.userId], references: [users.id] }),
}));

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;
export type InsertFileMetadata = z.infer<typeof insertFileMetadataSchema>;
export type FileMetadata = typeof fileMetadata.$inferSelect;
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Folder = typeof folders.$inferSelect;

export type FileWithMetadata = File & {
  metadata?: FileMetadata;
  folder?: Folder;
};

export type FolderWithChildren = Folder & {
  children?: Folder[];
  files?: File[];
  parent?: Folder;
};
