import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Poppins', 'system-ui', 'sans-serif'],
			},
			fontSize: {
				// Escala tipográfica profissional padronizada (Stripe/Linear-like)
				'xs':   ['0.75rem',  { lineHeight: '1rem',    letterSpacing: '0.01em' }],   // 12
				'sm':   ['0.8125rem',{ lineHeight: '1.125rem'}],                            // 13
				'base': ['0.875rem', { lineHeight: '1.375rem'}],                            // 14
				'lg':   ['1rem',     { lineHeight: '1.5rem'  }],                            // 16
				'xl':   ['1.125rem', { lineHeight: '1.625rem'}],                            // 18
				'2xl':  ['1.25rem',  { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],  // 20
				'3xl':  ['1.5rem',   { lineHeight: '2rem',    letterSpacing: '-0.015em' }], // 24
				'4xl':  ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],  // 30
				'5xl':  ['2.25rem',  { lineHeight: '2.5rem',  letterSpacing: '-0.02em' }],  // 36
				'6xl':  ['2.75rem',  { lineHeight: '3rem',    letterSpacing: '-0.025em' }], // 44
			},
			colors: {
				// Cores base do sistema (light e dark mode via CSS variables)
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				
				// Cores principais
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					hover: 'hsl(var(--primary-hover))',
					active: 'hsl(var(--primary-active))',
					glow: 'hsl(var(--primary-glow))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
					hover: 'hsl(var(--secondary-hover))',
					active: 'hsl(var(--secondary-active))',
					glow: 'hsl(var(--secondary-glow))',
				},
				
				// Cores de estado
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				progress: {
					track: 'hsl(var(--progress-track))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				
				// Cores de componentes
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))',
				},
				
				// Cores específicas para funcionalidades
				'breathing': {
					primary: 'hsl(var(--breathing-primary))',    // Azul calmante
					secondary: 'hsl(var(--breathing-secondary))', // Verde refrescante
					inhale: 'hsl(var(--breathing-inhale))',      // Verde suave para inspirar
					hold: 'hsl(var(--breathing-hold))',          // Azul médio para segurar
					exhale: 'hsl(var(--breathing-exhale))',      // Azul claro para expirar
					pause: 'hsl(var(--breathing-pause))',        // Azul muito suave para pausa
				},
				'sounds': {
					primary: 'hsl(var(--sounds-primary))',       // Roxo relaxante
					secondary: 'hsl(var(--sounds-secondary))',   // Lilás suave
					accent: 'hsl(var(--sounds-accent))',         // Lavanda
				},
				'evolution': {
					primary: 'hsl(var(--evolution-primary))',    // Verde de crescimento
					secondary: 'hsl(var(--evolution-secondary))' // Verde mais claro
				},
				'sos': {
					primary: 'hsl(var(--sos-primary))',          // Vermelho alerta (suavizado)
					secondary: 'hsl(var(--sos-secondary))',      // Laranja exclusivo do SOS
					'secondary-hover': 'hsl(var(--sos-secondary-hover))',
					'secondary-active': 'hsl(var(--sos-secondary-active))',
					'secondary-foreground': 'hsl(var(--sos-secondary-foreground))',
					soft: 'hsl(var(--sos-soft))',                // Fundo laranja suave, exclusivo do SOS
					glow: 'hsl(var(--sos-glow))'                 // Brilho suave para atenção
				},
				calm: 'hsl(var(--calm))',                        // Fundo do modo crise (Fase 6c)
			},
			boxShadow: {
				xs: 'var(--shadow-xs)',
				sm: 'var(--shadow-sm)',
				DEFAULT: 'var(--shadow-md)',
				md: 'var(--shadow-md)',
				lg: 'var(--shadow-lg)',
				xl: 'var(--shadow-xl)',
				primary: 'var(--shadow-primary)',
				secondary: 'var(--shadow-secondary)',
				success: 'var(--shadow-success)',
				warning: 'var(--shadow-warning)',
				destructive: 'var(--shadow-destructive)',
			},
			backgroundImage: {
				'gradient-primary': 'var(--gradient-primary)',
				'gradient-secondary': 'var(--gradient-secondary)',
				'gradient-brand': 'var(--gradient-brand)',
				'gradient-card': 'var(--gradient-card)',
			},
			animation: {
				'fade-in': 'fadeIn 0.5s ease-in-out',
				'slide-up': 'slideUp 0.4s ease-out',
				'breathing': 'breathing 8s ease-in-out infinite',
				'pulse-gentle': 'pulseGentle 2s ease-in-out infinite',
				'expand': 'expand 0.2s ease-out',
				'sound-wave': 'soundWave 1.5s ease-in-out infinite',
			},
			transitionDuration: {
				'4000': '4000ms',
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fadeIn': {
					from: {
						opacity: '0',
						transform: 'translateY(10px)'
					},
					to: {
						opacity: '1',
						transform: 'translateY(0)'
					}
				},
				'slideUp': {
					from: {
						opacity: '0',
						transform: 'translateY(20px)'
					},
					to: {
						opacity: '1',
						transform: 'translateY(0)'
					}
				},
				'breathing': {
					'0%, 100%': {
						transform: 'scale(1)',
					},
					'50%': {
						transform: 'scale(1.2)',
					}
				},
				'pulseGentle': {
					'0%, 100%': {
						transform: 'scale(1)',
						opacity: '1'
					},
					'50%': {
						transform: 'scale(1.05)',
						opacity: '0.9'
					}
				},
				'expand': {
					'0%': {
						transform: 'scale(1)'
					},
					'100%': {
						transform: 'scale(1.05)'
					}
				},
				'soundWave': {
					'0%, 100%': {
						transform: 'scale(1)',
						opacity: '0.6'
					},
					'50%': {
						transform: 'scale(1.1)',
						opacity: '1'
					}
				}
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
