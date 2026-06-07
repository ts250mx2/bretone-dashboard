import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json();

        const result = await query(
            'SELECT * FROM tblUsuarios WHERE Login = ? AND Password = ?',
            [username, password]
        );

        if (result && result.length > 0) {
            const user = result[0];
            const sessionData = { username: user.Login, id: user.IdUsuario };
            const expires = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours
            const session = await encrypt(sessionData);

            (await cookies()).set('session', session, { expires, httpOnly: true });

            return NextResponse.json({ success: true, message: 'Login exitoso' });
        } else {
            return NextResponse.json({ success: false, message: 'Usuario o contraseña incorrectos' }, { status: 401 });
        }
    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
    }
}
