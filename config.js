// config.js
export const SUPABASE_URL = 'https://sfiezqvhbnpjrtdsmcxc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_yfIe49lEmLRf2oQjVKIV_w_SPgjnHbf';

// Permanent system-wide Gemini API Key for OCR, Thaiba Voice, and Multimodal Vision
const _gEnc = 'QVEuQWI4Uk42SWdQN2FLbzh1ZF9qWGlkWmRTVlZjSXJTRi1DM1pidTloTS1LMHZpQzlUOFE=';
export const GEMINI_API_KEY = (typeof atob === 'function') 
    ? atob(_gEnc) 
    : (typeof Buffer !== 'undefined' ? Buffer.from(_gEnc, 'base64').toString('utf8') : '');
