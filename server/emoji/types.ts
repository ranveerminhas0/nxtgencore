/**
 * Emoji Stealing Feature - Type Definitions
 */

export interface ParsedEmoji {
    id: string;
    name: string;
    animated: boolean;
    url: string;
}

export interface ParsedSticker {
    id: string;
    name: string;
    url: string;
    formatType: number;
}

export interface EmojiUploadResult {
    success: boolean;
    emoji?: any;
    error?: string;
}

export interface StickerUploadResult {
    success: boolean;
    sticker?: any;
    error?: string;
}
