import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get('/api/message', async (req, res) => {
    try {
        const message = req.query.message;
        // Send headers to enable streaming in the response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4',
                messages: [{ role: 'user', content: message }],
                stream: true
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'stream'
            }
        );

        response.data.on('data', (chunk) => {
            let buffer = '';
            buffer += chunk.toString();

            const lines = buffer.split('\n');
            buffer = lines.pop();

            lines.forEach((line) => {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ')) {
                    const data = trimmedLine.replace(/^data: /, '');

                    if (data === '[DONE]') {
                        res.write('data: [DONE]\n\n');
                        res.end();
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed?.choices?.[0]?.delta?.content;
                        if (content) {
                            res.write(`data: ${content}\n\n`);
                        }
                    } catch (error) {
                        console.error('Failed to parse JSON:', error.message);
                    }
                }
            });
        });

        response.data.on('end', () => {
            res.end();
        });

        response.data.on('error', (error) => {
            console.error('Stream error:', error.message);
            res.status(500).send('Error with the OpenAI API');
        });

    } catch (error) {
        console.error('Error calling OpenAI API:', error.message || error.response?.data);
        res.status(500).json({
            error: 'An error occurred while communicating with the OpenAI API'
        });
    }
});

// POST route to save the chat data into a JSON file named after the chatId
app.post('/api/save-chat', async (req, res) => {
    try {
        const { chatId, userId, messages } = req.body;

        // Use chatId as the JSON filename
        const filename = `${chatId}.json`;
        const filePath = path.join(__dirname, 'chats', filename);

        // Create the data to be saved
        const chatData = {
            chatId,
            userId,
            messages,
            timestamp: new Date().toISOString(),
        };

        // Ensure the 'chats' directory exists
        if (!fs.existsSync(path.join(__dirname, 'chats'))) {
            fs.mkdirSync(path.join(__dirname, 'chats'));
        }

        // Write the chat data to a JSON file (overwrites if it already exists)
        fs.writeFileSync(filePath, JSON.stringify(chatData, null, 2));

        res.status(200).json({
            message: 'Chat saved successfully',
            filename,
        });
    } catch (error) {
        console.error('Error saving chat:', error.message);
        res.status(500).json({
            error: 'An error occurred while saving the chat',
        });
    }
});

app.get('/api/search-chats', (req, res) => {
    const { userId } = req.query; // You can add other search criteria as needed
    const chatsDirectory = path.join(__dirname, 'chats');

    try {
        // Check if the chats directory exists
        if (!fs.existsSync(chatsDirectory)) {
            return res.status(404).json({ message: 'No chat history found' });
        }

        // Read all files in the 'chats' directory
        const chatFiles = fs.readdirSync(chatsDirectory);
        const chatHistories = [];

        // Loop through files and filter based on userId if provided
        chatFiles.forEach(file => {
            const filePath = path.join(chatsDirectory, file);
            const chatData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            // If userId is provided, filter the chat data
            if (!userId || chatData.userId === userId) {
                chatHistories.push(chatData);
            }
        });

        // If no chats were found based on the criteria
        if (chatHistories.length === 0) {
            return res.status(404).json({ message: 'No matching chats found' });
        }

        // Return the filtered chat histories
        return res.status(200).json(chatHistories);
    } catch (error) {
        console.error('Error retrieving chat history:', error.message);
        return res.status(500).json({ error: 'An error occurred while retrieving chat history' });
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
