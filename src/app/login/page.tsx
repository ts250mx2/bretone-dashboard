'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await res.json();

            if (data.success) {
                router.push('/dashboard');
                router.refresh();
            } else {
                setError(data.message || 'Credenciales incorrectas');
            }
        } catch (err) {
            setError('Error de conexión. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #FCFAF5 0%, #F3E7D2 45%, #FAF1E0 100%)' }}
        >
            {/* Decorative background circles */}
            <div className="absolute top-[-10%] left-[-5%] w-96 h-96 rounded-full opacity-25"
                style={{ background: 'radial-gradient(circle, #EDA60A, transparent 70%)' }}
            />
            <div className="absolute bottom-[-10%] right-[-5%] w-80 h-80 rounded-full opacity-20"
                style={{ background: 'radial-gradient(circle, #0E9488, transparent 70%)' }}
            />
            <div className="absolute top-[40%] right-[15%] w-48 h-48 rounded-full opacity-10"
                style={{ background: 'radial-gradient(circle, #D6402C, transparent 70%)' }}
            />

            {/* Subtle dots pattern */}
            <div className="absolute inset-0 opacity-[0.06]"
                style={{
                    backgroundImage: 'radial-gradient(circle, #3D1C02 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}
            />

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-6">
                <div className="rounded-2xl overflow-hidden"
                    style={{
                        background: '#ffffff',
                        border: '1px solid rgba(61, 28, 2, 0.08)',
                        boxShadow: '0 24px 56px rgba(61, 28, 2, 0.16), 0 2px 10px rgba(61, 28, 2, 0.06)'
                    }}
                >
                    {/* Header stripe */}
                    <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #EDA60A 0%, #D6402C 50%, #0E9488 100%)' }} />

                    <div className="p-8">
                        {/* Logo area */}
                        <div className="flex flex-col items-center mb-8">
                            <div className="mb-4 px-6 py-3 rounded-xl"
                                style={{ background: 'linear-gradient(135deg, #3D1C02, #5C2A06)' }}
                            >
                                <img
                                    src="/logo.png"
                                    alt="La Petite Bretonne"
                                    className="h-16 w-auto object-contain"
                                    onError={(e) => {
                                        // Fallback if logo not found
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                <div className="text-center mt-1">
                                    <p className="text-xs font-bold tracking-widest uppercase"
                                        style={{ color: '#EDA60A' }}
                                    >Dashboard</p>
                                </div>
                            </div>
                            <h1 className="text-2xl font-black tracking-tight mt-1"
                                style={{ color: '#3D1C02' }}
                            >
                                Bienvenido
                            </h1>
                            <p className="text-sm font-medium mt-1" style={{ color: '#7A4520' }}>
                                Ingresa tus credenciales para continuar
                            </p>
                        </div>

                        {/* Error Alert */}
                        {error && (
                            <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold"
                                style={{
                                    background: 'rgba(204, 34, 34, 0.08)',
                                    border: '1px solid rgba(204, 34, 34, 0.25)',
                                    color: '#D6402C'
                                }}
                            >
                                <AlertCircle size={16} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Username field */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider mb-2"
                                    style={{ color: '#3D1C02' }}
                                >
                                    Usuario
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                                        <User size={16} style={{ color: '#7A4520' }} />
                                    </div>
                                    <input
                                        id="username"
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Ingresa tu usuario"
                                        required
                                        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-semibold outline-none transition-all"
                                        style={{
                                            background: '#fff',
                                            border: '1.5px solid rgba(61, 28, 2, 0.15)',
                                            color: '#3D1C02',
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#EDA60A';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(237, 166, 10, 0.18)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'rgba(61, 28, 2, 0.15)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Password field */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider mb-2"
                                    style={{ color: '#3D1C02' }}
                                >
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                                        <Lock size={16} style={{ color: '#7A4520' }} />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-10 pr-12 py-3 rounded-xl text-sm font-semibold outline-none transition-all"
                                        style={{
                                            background: '#fff',
                                            border: '1.5px solid rgba(61, 28, 2, 0.15)',
                                            color: '#3D1C02',
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = '#EDA60A';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(237, 166, 10, 0.18)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'rgba(61, 28, 2, 0.15)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                                        style={{ color: '#7A4520' }}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Submit button */}
                            <button
                                id="login-submit"
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                                style={{
                                    background: loading
                                        ? 'rgba(61, 28, 2, 0.5)'
                                        : 'linear-gradient(135deg, #3D1C02, #5C2A06)',
                                    color: '#EDA60A',
                                    boxShadow: loading ? 'none' : '0 4px 16px rgba(61, 28, 2, 0.3)',
                                }}
                                onMouseEnter={(e) => {
                                    if (!loading) {
                                        (e.target as HTMLButtonElement).style.background = 'linear-gradient(135deg, #5C2A06, #7A3808)';
                                        (e.target as HTMLButtonElement).style.transform = 'translateY(-1px)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!loading) {
                                        (e.target as HTMLButtonElement).style.background = 'linear-gradient(135deg, #3D1C02, #5C2A06)';
                                        (e.target as HTMLButtonElement).style.transform = 'translateY(0)';
                                    }
                                }}
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Ingresando...
                                    </span>
                                ) : (
                                    'Ingresar'
                                )}
                            </button>
                        </form>

                        {/* Footer */}
                        <div className="mt-8 text-center">
                            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(61, 28, 2, 0.35)' }}>
                                La Petite Bretonne © {new Date().getFullYear()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
