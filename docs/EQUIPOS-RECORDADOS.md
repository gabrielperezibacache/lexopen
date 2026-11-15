# Equipos recordados

Al ingresar con contraseña y completar 2FA, puede marcar **Recordar este navegador durante 30 días**. La contraseña sigue siendo obligatoria en cada ingreso; la confianza sustituye únicamente el segundo factor durante ese plazo. Cerrar sesión no retira la confianza del navegador.

En **Mi cuenta → Equipos recordados** puede consultar el navegador/sistema, último ingreso y vencimiento, identificar el navegador actual y revocar un equipo o todos. La revocación se comprueba en el servidor en el próximo ingreso. Las sesiones ya abiertas conservan su duración habitual; retirar la confianza no equivale a cerrar esas sesiones.

Cambiar o restablecer la contraseña, desactivar 2FA o configurar de nuevo el factor invalida la confianza anterior. La rotación normal de sesiones se mantiene separada de esa invalidación. El vencimiento no se extiende al usar el equipo.

Cada cuenta administra únicamente sus propios equipos. La cookie es opaca, HttpOnly y utiliza la política Secure del Host. La base conserva una huella del token y una vinculación de seguridad; la API no devuelve esas huellas ni el token. El nombre del equipo se reduce a categorías de navegador y sistema. No se recopilan IP, ubicación ni el agente de usuario completo para este registro. Consultas, usos y revocaciones se auditan sin tokens.
