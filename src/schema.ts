import {sqliteTable,integer,text} from "drizzle-orm/sqlite-core"

// ユーザーテーブル
export const user = sqliteTable("user",{
	id: text("id").primaryKey(), // 一意のUUID
	serverFingerprint: text("server_fingerprint").notNull(), // サーバー側のFingerPrint
	clientFingerprint: text("client_fingerprint").notNull(), // クライアントのFingerPrint
	vote: text("vote"), // 投票結果（投票先のID、またはJSON形式）
	createdAt: integer("created_at", { mode: "timestamp" }).notNull() // 作成日時
})

export type VoteItem = {
    name: string; // 名前
	title: string; // テーマ
	description: string; // 説明
	image: string; // 画像URL
	comment: string; // コメント
	location: string; // 場所
}

// 投票対象一覧の型定義
export type VoteItemList = { [key: string]: VoteItem };
