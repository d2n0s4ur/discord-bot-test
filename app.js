const { Client, GatewayIntentBits, Collection, DiscordAPIError, EmbedBuilder, MessageAttachment } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();
const fs = require('node:fs');
const path = require('node:path');

//토큰 값 파싱
const token = process.env.DISCORD_TOKEN;

// const client = new Client({ intents: [GatewayIntentBits.Guilds] });
// 봇에tj 권한 부여
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });


// Command 연결
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

// Event 연결
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// 커맨드를 입력하면 해당 커맨드 실행
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return ;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true});
  }
});

// 메시지 작성 시 확인 -> 해시태그 게시판으로 가게
client.on('messageCreate', msg => {
  const MainchannelId = '1010496175520104490'; // Put <전체> channel's ID;
  const hashtagchannelIds = ['1015931645070676008', '1015931665333354546']; // put hashtag channel's IDs (ex. #그림체 #노말 #피드백 #팬아트 etc ..)
  if (msg.channelId != MainchannelId)
    return ;

  let mentionedchannelId = getmentionIds(msg.mentions.channels);
  mentionedchannelId.forEach((item) => {
    if (hashtagchannelIds.indexOf(String(item)) != -1) { // 채널 언급을 했는데, 해당 채널이 해시태크 채널인 경우
      const url = `https://discord.com/channels/${msg.guildId}/${msg.channelId}}/${msg.id}`;
      let attachmentembed = getattachmentURLs(msg.attachments, url);
      client.channels.cache.get(String(item)).send({content: msg.content, embeds: attachmentembed});
    }
  });
});

// Channel map 객체에서 channel의 ID를 파싱
const getmentionIds = (channelsMap) => {
  const channels = [];
  channelsMap.forEach((item)=>{
    channels.push(item.id.replace('#',''));
  })
  return (channels);
};

const getattachmentURLs = (attachmentsMap, url) => {
  let flag = 0;
  const URLs = [];
  attachmentsMap.forEach((item) => {
    if (flag == 0)
    {
      URLs.push(new EmbedBuilder().setURL(url).setImage(item.url).setTitle("title").setDescription("desc").setFooter({ text: "footer" }));
      flag = 1;
    }
    else {
      URLs.push(new EmbedBuilder().setImage(item.url));
    }
  });
  return (URLs);
}

// Bot login to server
client.login(token);