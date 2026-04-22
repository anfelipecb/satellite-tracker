import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        void: '#05060a',
        aurora: '#22d3ee',
        ember: '#fb7185',
      },
    },
  },
  plugins: [],
};

export default config;
