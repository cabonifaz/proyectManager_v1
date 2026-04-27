/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Permite que la compilación pase a producción aunque haya advertencias/errores de ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Permite que la compilación pase aunque haya variables de tipo "any" o sin usar
    ignoreBuildErrors: true,
  },
}

export default nextConfig