const { Client, GatewayIntentBits, Collection, DiscordAPIError, EmbedBuilder, MessageAttachment, Partials, ReactionUserManager } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();
const fs = require('node:fs');
const path = require('node:path');
const { callbackify } = require('node:util');
const sqlite3 = require('sqlite3').verbose();

// setting DB
const dbPath = path.resolve(__dirname, './db/feedback.db');
let db = new sqlite3.Database('./db/feedback.db'/*dbPath*/, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
      console.error(err.message);
      console.error(dbPath);
  } else {
      console.log('Connected to the database.');
  }
});

//토큰 값 파싱
const token = process.env.DISCORD_TOKEN;

// const client = new Client({ intents: [GatewayIntentBits.Guilds] });
// 봇에tj 권한 부여
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});


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

// when join discord -> give 5 points
client.on('guildMemberAdd', async (member) => {
  //set sql ${member.id}'s point as 5
  const defaultpoint = 5;

  const query = `INSERT INTO feedback VALUES(${member.user.id}, ${defaultpoint})`;
  db.all(query,(err)=>{
    if(err) console.log(err);
  });
});

// message create -> goto hashboard
client.on('messageCreate', async (msg) => {
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

// messsage create -> in feedback Channel
client.on('messageCreate', async (msg) => {
  try {
    const FeedBackChannelId = '1017416270452367370';
    if (msg.channelId != FeedBackChannelId || msg.author.bot)
      return ;

    const mypoint = await getFeedbackPoint(msg.author.id); // get feedback point from sqlite

    if (mypoint === 0) { // if point is 0 => can't get feedback -> delete article & DM send
      msg.author.send("피드백 포인트가 있는 경우에만 피드백을 신청할 수 있습니다!```작성하신 메시지\n" + msg.content + "```");
      msg.delete();
      return ;
    } else { // make feedback tickets & feedback article
      setFeedbackPoint(msg.author.id, mypoint - 1);
      msg.delete();
      const url = `https://discord.com/channels/${msg.guildId}/${msg.channelId}}`;
      let attachmentembed = getattachmentURLs(msg.attachments, url);
      const FeedBackEmbed = new EmbedBuilder().setTitle(`피드백을 하기 위해서는 아래 📩를 클릭하세요! 티켓이 생성됩니다.`);
      const newembed = msg.channel.send({content: `<@${msg.author.id}>님의 피드백 요청입니다.` + "```" + msg.content + "```", embeds: attachmentembed, FeedBackEmbed});
      (await newembed).react('📩');
      return ;
    }
  } catch (err) {
    console.log(err);
  }
});

// Check msg's react for feedback ticket
/*  @param TODO */
client.on('messageReactionAdd', async (reaction, user) => {
  const FeedBackChannelId = '1017416270452367370';
  
  if (reaction.message.channelId != FeedBackChannelId || user.bot) return;
  
  if (reaction.emoji.name === '📩') {
    console.log('Creating Feedback Channel');
    try {
      // console.log(reaction.message.guild);
      // console.log(reaction.message.mentions.users.entries().next().value);
      // const roleIds = JSON.parse(roleIdsString);
      // const permissions = roleIds.map((id) => ({ allow: 'VIEW_CHANNEL', id}));
      const channel = await reaction.message.guild.channels.create('Feedback', {
        type: 'text',
        permissionOverwrites: [
          { deny: 'VIEW_CHANNEL', id: reaction.message.guild.id },
          { allow: 'VIEW_CHANNEL', id: user.id },
          // { allow: 'VIEW_CHANNEL', id: reaction.message.author.id},
          ]
      });
      const msg = await channel.send('Please explain a brief description about your query below, our staff will get back to you as soon as possible. \nReact below to close this ticket.');
      await msg.react('🔒'); //when a user reacts to this it will close this ticket
      msg.pin();
                  
      const ticket = await Ticket.create({
        authorId: user.id,
        channelId: channel.id,
        guildId: reaction.message.guild.id,
        resolved: false,
        closedMessageId: msg.id
      });

      const ticketId = String(ticket.getDataValue('ticketId')).padStart(4, 0);
        await channel.edit({ name: `feedback-${ticketId}`})
      } catch (err) {
        console.log(err);
        client.users.cache.get(owner).send(err);
    }
  } else if (reaction.emoji.name === '🔒') { 
    const ticket = await Ticket.findOne({ where: { channelId: reaction.message.channel.id }}) //this part closes the ticket / hides it from the user so only admins can see
    if (ticket) {
      console.log('Ticket has been found');
      const closedMessageId = ticket.getDataValue('closedMessageId');
      if (reaction.message.id === closedMessageId) {
        reaction.message.channel.updateOverwrite(ticket.getDataValue('authorId'), {
          VIEW_CHANNEL: false 
        }).catch((err) => console.log(err));
          ticket.resolved = true;
          await ticket.save();
          console.log('Updated');
      }
    }
  };
});


// Channel map 객체에서 channel의 ID를 파싱
const getmentionIds = (channelsMap) => {
  const channels = [];
  channelsMap.forEach((item)=>{
    channels.push(item.id.replace('#',''));
  })
  return (channels);
};

// attachment urls to embed
const getattachmentURLs = (attachmentsMap, url) => {
  let flag = 0;
  const URLs = [];
  attachmentsMap.forEach((item) => {
    if (flag == 0)
    {
      URLs.push(new EmbedBuilder().setURL(url).setImage(item.url));
      flag = 1;
    }
    else {
      URLs.push(new EmbedBuilder().setURL(url).setImage(item.url));
    }
  });
  return (URLs);
}

const getFeedbackPoint = (id) => {
  return new Promise((resolve, reject) => {
    const query = `select point from feedback where id=${id}`;
    db.serialize();
    db.all(query,(err, row)=>{
      if(err) {
        console.log('db error: ' + err);
        resolve(0);
      }
      else
        resolve(row[0]['point']);
    });
  })
}

const setFeedbackPoint = (id, newpoint) => {
  const query = `UPDATE feedback SET point=${newpoint} where id='${id}'`;
  db.serialize();
  db.all(query, (err) => {
    if (err) 
    {
      console.log('db err: ' + err);
      return ;
    }
  });
}

// Bot login to server
client.login(token);