/**
 * AI Chat API Routes
 */

import { Router } from 'express';
import { processAIChat } from '../services/ai-chat.service';

const router = Router();

/**
 * POST /api/v1/ai/chat
 * Send a message to the AI assistant
 */
router.post('/ai/chat', async (req, res) => {
  try {
    const { deviceUuid, message, conversationHistory } = req.body;

    if (!deviceUuid || !message) {
      return res.status(400).json({
        error: 'Missing required fields: deviceUuid, message',
      });
    }

    const response = await processAIChat({
      deviceUuid,
      message,
      conversationHistory: conversationHistory || [],
    });

    res.json({ response });
  } catch (error: any) {
    console.error('AI chat error:', error);
    res.status(500).json({
      error: 'AI chat failed',
      message: error.message,
    });
  }
});

export default router;
