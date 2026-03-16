import type { Config } from "tailwindcss";

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
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				// סוףסיפור Global Design Tokens
				brandYellow: '#FFC72C',
				textPrimary: '#1A1A1A',
				textSecondary: '#555555',
				surfaceLight: '#F4F5F7',
				// Gray color override for placeholders
				gray: {
					400: '#9CA3AF'
				},
				// Legacy colors (keeping for backward compatibility)
				'yellow-primary': '#FFD042',
				'gray-light': '#F1F1F1',
				creamBase: "#FFF7E0",
				"accent-peach": "#F7C694",
				dark: "#8B572A",
				cta: "#FFEB3B",
				"card-blue": "#A3D9E2",
				"card-green": "#C2D4A3",
				"card-purple": "#D7C2E2",
				"card-orange": "#F9BE85"
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
				card: '32px',
				pill: '9999px'
			},
			fontFamily: {
				display: ['"Baloo 2"', 'sans-serif'],
				body: ['Inter', 'sans-serif'],
				sans: ['Roboto', 'sans-serif'],
				'heading': ['Tilt Warp', 'sans-serif'],
				'nunito': ['Nunito', 'sans-serif'],
				'fredoka': ['Fredoka', 'sans-serif']
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
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
