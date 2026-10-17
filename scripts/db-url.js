// Monta o endereço do banco a partir de DATABASE_URL + DB_PASSWORD.
//
// A senha fica numa variável separada (DB_PASSWORD) para ser só colada numa
// caixa vazia na Render, sem editar o meio de um endereço comprido. Ela é
// codificada aqui, então caracteres especiais na senha não quebram a URL.
const raw = process.env.DATABASE_URL || '';
const pw = process.env.DB_PASSWORD;
if (!pw) {
  process.stdout.write(raw);
} else {
  const u = new URL(raw);
  u.password = encodeURIComponent(pw);
  process.stdout.write(u.toString());
}
