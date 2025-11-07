require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const PREFIX = process.env.PREFIX || '!';
const TENOR_KEY = process.env.TENOR_KEY || 'LIVDSRZULELA';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('ERRO: Defina DISCORD_TOKEN no arquivo .env');
  process.exit(1);
}

// carrega comandos
let comandos = {};
try {
  comandos = JSON.parse(fs.readFileSync('./comandos.json', 'utf8'));
} catch (e) {
  console.error('Não foi possível ler comandos.json — verifique o arquivo.', e);
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// busca GIFs no Tenor
async function buscarTenor(query) {
  try {
    const q = encodeURIComponent(query);
    const url = `https://g.tenor.com/v1/search?q=${q}&key=${TENOR_KEY}&limit=8&contentfilter=medium`;
    const res = await axios.get(url, { timeout: 8000 });
    const results = res?.data?.results || [];
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    const media = pick.media && pick.media[0];
    if (!media) return null;
    return media.gif?.url || media.mediumgif?.url || media.mp4?.url || media.tinygif?.url || null;
  } catch (err) {
    console.error('Erro Tenor:', err?.message || err);
    return null;
  }
}

// Pega 5 membros aleatórios do servidor
async function pegarUsuariosAleatorios(guild) {
  try {
    await guild.members.fetch(); // garante que todos os membros sejam carregados
    const membros = guild.members.cache.filter(m => !m.user.bot).map(m => `<@${m.user.id}>`);
    const shuffle = membros.sort(() => 0.5 - Math.random());
    return shuffle.slice(0, 5);
  } catch (err) {
    console.error('Erro ao pegar usuários aleatórios:', err);
    return ['ninguém', 'ninguém', 'ninguém', 'ninguém', 'ninguém'];
  }
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmdName = args.shift().toLowerCase();
    const cmd = comandos[cmdName] || comandos.rankings?.[cmdName];
    if (!cmd) return;

    const actorMention = `<@${message.author.id}>`;
    let targetUser = null;
    if (message.mentions.users.size > 0) {
      targetUser = message.mentions.users.first();
    } else if (args.length > 0) {
      const possible = args[0].replace(/[<@!>]/g, '');
      if (/^\d+$/.test(possible)) {
        try { targetUser = await message.client.users.fetch(possible); } catch { targetUser = null; }
      }
    }
    const targetMention = targetUser ? `<@${targetUser.id}>` : (args[0] || 'ninguém');

    // Verifica se comando precisa de menção
    if (cmd.mention === true && !targetUser && !cmdName.startsWith('rank')) {
      await message.reply({ content: `❗ Marque alguém para usar \`${PREFIX}${cmdName}\`. Ex: \`${PREFIX}${cmdName} @usuario\`` });
      return;
    }

    let texto = cmd.texto;

    // Comandos de rank: substitui {top_random_5}
    if (cmdName.startsWith('rank')) {
      const usuarios = await pegarUsuariosAleatorios(message.guild);
      texto = texto.replace(/{top_random_5}/g, usuarios.join(', '));
    } else {
      const porcentagem = Math.floor(Math.random() * 101);
      texto = texto
        .replace(/{actor}/g, actorMention)
        .replace(/{target}/g, targetMention)
        .replace(/{porcentagem}/g, String(porcentagem));
    }

    // Busca mídia
    let mediaUrl = null;
    if (cmd.query) {
      const q = cmd.query
        .replace(/{actor}/g, message.author.username)
        .replace(/{target}/g, targetUser ? targetUser.username : (args[0] || ''));
      mediaUrl = await buscarTenor(q);
    } else if (cmd.imagem) {
      mediaUrl = cmd.imagem;
    }

    const embed = new EmbedBuilder()
      .setDescription(texto)
      .setColor(cmd.color || 0x00AE86)
      .setFooter({ text: `Comando: ${PREFIX}${cmdName}` })
      .setTimestamp();

    if (mediaUrl) embed.setImage(mediaUrl);

    await message.channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Erro ao processar comando:', err);
  }
});

client.login(DISCORD_TOKEN);
