import express from 'express';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import 'dotenv/config';
import { client, initializeDb } from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Configuración de CORS para soportar desarrollo local y despliegue en Netlify
const allowedOrigins = [
    'http://localhost:5174', // Vite Development Server (Local)
    'https://iridescent-cannoli-857c6f.netlify.app' // Netlify Production URL
];

// Middleware
app.use(cors({
    origin: allowedOrigins, // Usamos el array de orígenes permitidos
    methods: ['POST', 'GET'], // Permitir GET para el perfil
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// 🔹 Generador de código personal de referido (ABC123)
function generateReferralCode() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    // Genera 3 letras aleatorias
    const randomLetters = Array(3).fill(0).map(() => letters[Math.floor(Math.random() * letters.length)]).join("");
    // Genera 3 números aleatorios
    const randomNumbers = Array(3).fill(0).map(() => numbers[Math.floor(Math.random() * numbers.length)]).join("");
    return randomLetters + randomNumbers; // Formato: LLLNNN
}

// --- Authentication Routes ---

// Get User Profile Details
app.get('/profile/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // 🔑 Seleccionamos 'role', 'referral_code', 'transactions_history' y AHORA 'balance'
        const result = await client.execute({
            sql: 'SELECT username, email, phone, created_at, referral_code, role, transactions_history, balance FROM users WHERE id = ?',
            args: [userId]
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const user = result.rows[0];

        // Formatear la fecha de registro (created_at)
        const date = new Date(user.created_at);
        const formattedDate = date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

        // Parsear el historial de transacciones (si es null o vacío, usar array vacío)
        const transactionsHistory = JSON.parse(user.transactions_history || '[]');

        res.status(200).json({
            username: user.username,
            email: user.email,
            phone: user.phone,
            registrationDate: formattedDate,
            role: user.role, 
            status: 'Activa', // Placeholder
            balance: user.balance, // Usamos el saldo real de la DB
            profileImageUrl: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
            referralCode: user.referral_code, 
            transactionsHistory: transactionsHistory, // Enviando el historial
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener el perfil.' });
    }
});

// --- Transaction Management Routes ---

// Endpoint para registrar una nueva transacción (Pendiente)
app.post('/transaction/record', async (req, res) => {
    const { userId, transaction } = req.body;

    if (!userId || !transaction) {
        return res.status(400).json({ message: 'Faltan datos de usuario o transacción.' });
    }

    try {
        // 1. Obtener el historial actual
        const userResult = await client.execute({
            sql: 'SELECT transactions_history FROM users WHERE id = ?',
            args: [userId]
        });

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const currentHistory = JSON.parse(userResult.rows[0].transactions_history || '[]');

        // 2. Añadir la nueva transacción al inicio (más reciente primero)
        const newHistory = [transaction, ...currentHistory];
        const newHistoryJson = JSON.stringify(newHistory);

        // 3. Actualizar la base de datos
        await client.execute({
            sql: 'UPDATE users SET transactions_history = ? WHERE id = ?',
            args: [newHistoryJson, userId]
        });

        res.status(200).json({ message: 'Transacción registrada exitosamente.', newHistory });

    } catch (error) {
        console.error('Transaction record error:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar la transacción.' });
    }
});

// Endpoint para ELIMINAR una transacción pendiente al cancelar
app.post('/transaction/cancel', async (req, res) => {
    const { userId, transactionId } = req.body;

    if (!userId || !transactionId) {
        return res.status(400).json({ message: 'Faltan datos de usuario o ID de transacción.' });
    }

    try {
        // 1. Obtener el historial actual
        const userResult = await client.execute({
            sql: 'SELECT transactions_history FROM users WHERE id = ?',
            args: [userId]
        });

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const currentHistory = JSON.parse(userResult.rows[0].transactions_history || '[]');

        // 2. Filtrar (eliminar) la transacción por ID
        const initialLength = currentHistory.length;
        // transactionId viene como número (Date.now()), aseguramos la comparación
        // 🔑 Eliminamos la transacción del array JSON
        const newHistory = currentHistory.filter(tx => tx.id !== transactionId); 
        
        if (newHistory.length === initialLength) {
            // Si la longitud no cambió, la transacción no fue encontrada
            return res.status(404).json({ message: 'Transacción no encontrada o ya procesada.' });
        }

        const newHistoryJson = JSON.stringify(newHistory);

        // 3. Actualizar la base de datos
        await client.execute({
            sql: 'UPDATE users SET transactions_history = ? WHERE id = ?',
            args: [newHistoryJson, userId]
        });

        res.status(200).json({ message: 'Transacción eliminada exitosamente.', newHistory });

    } catch (error) {
        console.error('Transaction deletion error:', error);
        res.status(500).json({ message: 'Error interno del servidor al eliminar la transacción.' });
    }
});


// Register User
app.post('/register', async (req, res) => {
    const { username, email, phone, password, referralCode } = req.body;

    // Validar campos obligatorios
    if (!username || !email || !password || !referralCode) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios, incluyendo el código de referido.' });
    }

    // Validar código general
    if (referralCode !== "BLD231") {
        return res.status(400).json({ message: 'Código de referido inválido. Solo se acepta BLD231.' });
    }

    try {
        // Verificar si el usuario ya existe
        const existingUser = await client.execute({
            sql: 'SELECT id FROM users WHERE email = ? OR username = ?',
            args: [email, username]
        });

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ message: 'El usuario o correo electrónico ya está registrado.' });
        }

        // Hash seguro
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 🔑 Generar código de referido único (ABC123)
        let personalReferral;
        let exists = true;

        while (exists) {
            personalReferral = generateReferralCode();
            const check = await client.execute({
                sql: 'SELECT id FROM users WHERE referral_code = ?',
                args: [personalReferral],
            });
            // Si no hay filas, el código es único
            if (check.rows.length === 0) exists = false;
        }
        
        const defaultRole = 'Usuario'; // Rol por defecto
        const defaultBalance = 0.00; // Saldo inicial por defecto (NUEVO)

        // Insertar nuevo usuario, incluyendo el rol, historial y saldo
        await client.execute({
            sql: `INSERT INTO users (username, email, phone, password_hash, referral_code, role, transactions_history, balance)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [username, email, phone, password_hash, personalReferral, defaultRole, '[]', defaultBalance] // Inicializar saldo
        });

        res.status(201).json({
            message: 'Registro exitoso. Ya puedes iniciar sesión.',
            personalReferral 
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error interno del servidor durante el registro.' });
    }
});

// Login User
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Correo electrónico y contraseña son requeridos.' });
    }

    try {
        const result = await client.execute({
            sql: 'SELECT id, username, password_hash FROM users WHERE email = ?',
            args: [email]
        });

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        const user = result.rows[0];
        const storedHash = user.password_hash;

        const isMatch = await bcrypt.compare(password, storedHash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        res.status(200).json({
            message: 'Login successful.',
            user: { id: user.id, username: user.username, email }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error interno del servidor durante el inicio de sesión.' });
    }
});

// Inicializar DB y arrancar servidor
initializeDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Backend Server running on http://localhost:${PORT}`);
    });
});
