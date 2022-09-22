const { Client, GatewayIntentBits, Collection, DiscordAPIError, EmbedBuilder, MessageAttachment, Partials, ReactionUserManager, PermissionFlagsBits, ChannelType, ConnectionVisibility, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dotenv = require('dotenv');
const { channel } = require('node:diagnostics_channel');
const fs = require('node:fs');
const { resolve } = require('node:path');
const path = require('node:path');
const { callbackify } = require('node:util');
const sqlite3 = require('sqlite3').verbose();
dotenv.config();

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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.DirectMessageReactions, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
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
    if(err) console.log("[-] set feedback point err: " + err);
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
      let row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel(`본문으로 가기`)
              .setStyle(ButtonStyle.Link)
              .setURL(url)
          );
      let secondrow = getHashtagChannelRow(msg);
      
      let contentembed = new EmbedBuilder()
        .setColor(0x00FFFF)
        .setAuthor({ name: msg.author.username + '#' + msg.author.discriminator, iconURL: msg.author.avatarURL()})
        .setDescription(msg.content.replace(/\<#(.*?)\>/gi, ''))
        .setTimestamp(Date.now())
        .setFooter({text: `from #${client.channels.cache.get(MainchannelId).name}`})
      attachmentembed.unshift(contentembed);
      const hashchannel = client.channels.cache.get(String(item))
      const newmsg = hashchannel.send({content: '', embeds: attachmentembed, components: [secondrow, row]});
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
client.on('messageReactionAdd', async (reaction, user) => {
  const FeedBackChannelId = '1017416270452367370';
  const FeedBackChannelCategoryId = '1019138276268974100';
  
  if ((reaction.message.channelId != FeedBackChannelId && reaction.message.channel.parentId != FeedBackChannelCategoryId) || user.bot) return;
  if (reaction.emoji.name === '📩') {
    console.log('Creating Feedback Channel');
    try {
      const ReactionRequestUserId = reaction.message.content.split(">")[0].split("<@")[1];
      reaction.message.guild.channels.create({
        name: `feedback-${ReactionRequestUserId}-${user.id}`,
        type: ChannelType.GuildText,
        parent: FeedBackChannelCategoryId,
        topic: user.id,
        permissionOverwrites: [
          { id: reaction.message.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]},
          { id: ReactionRequestUserId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]},
          ],
      }).then(async c => {
        console.log(`#feedback-${ReactionRequestUserId}-${user.id} has been created`);
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel(`피드백 내용 바로보기`)
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.com/channels/${reaction.message.guildId}/${reaction.message.channelId}}/${reaction.message.id}`)
          );
        const msg = await c.send({
          content: `피드백을 할 수 있는 채널입니다. 관리자가 로깅을 하고 있으니, 상대방을 모욕하거나 가혹한 행위는 자제해주시길 바랍니다. \n피드백을 받는 사용자는 피드백이 완료된 후 아래 reaction을 통해 피드백 채널을 닫을 수 있습니다.\n`,
          components: [row]
        });
        await msg.react('🔒'); //when a user reacts to this it will close this ticket
        msg.pin(); 
      });
    } catch (e) {
      console.log(e);
    }
  }
  // When react with 🔒 & evaluator react -> close channel (it means just move channel to archive(only admin can see))
  if (reaction.emoji.name === '🔒' && reaction.message.channel.name.indexOf(user.id) != -1)
  {
    const TargetChannel = reaction.message.channel;
    console.log(`Request Delete #${TargetChannel.name}`);
    const Remsg = await TargetChannel.send({content: `피드백이 정말로 완료 되었나요? 아래 reaction에 공감하는 경우, 최종적으로 채널이 삭제됩니다.`, ephemeral: true});
    await Remsg.react('✅');
  }
  if (reaction.emoji.name === '✅' && reaction.message.channel.name.split('-')[2].indexOf(user.id) != -1 && reaction.message.author.bot && reaction.message.content.indexOf(`피드백이 정말로 완료 되었나요? 아래 reaction에 공감하는 경우, 최종적으로 채널이 삭제됩니다.`) != -1)
  {
    const TargetChannel = reaction.message.channel;
    const id = reaction.message.channel.name.split('-')[2];
    addFeedbackPoint(id); // add interviewer's feedbackpoint
    const Delmsg = await TargetChannel.send({content: `3초 내로 Channel이 삭제됩니다...`, ephemeral: true});
    TargetChannel.delete();
  }
});

// Parsing Channel's ID from Channel map object.
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
    URLs.push(new EmbedBuilder().setImage(item.url));
  });
  return (URLs);
}

// Hashtag to conetents Button
const getHashtagChannelRow = (msg, row) => {
  const TagedChannelList = msg.content.match(/\<#(.*?)\>/gi);
  let ret = new ActionRowBuilder();
  TagedChannelList.forEach((item) => {
    if (client.channels.cache.get(item.split('<#')[1].split('>')[0]) != undefined)
    {
      ret.addComponents(
        new ButtonBuilder()
          .setLabel(`#${client.channels.cache.get(item.split('<#')[1].split('>')[0]).name}`)
          .setStyle(ButtonStyle.Link)
          .setURL(client.channels.cache.get(item.split('<#')[1].split('>')[0]).url)
          // .setDisabled(true)
      );  
    }
  });
  return (ret);
}

// Get userid's Feedback point from DB
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

// Set userid's Feedback point as newpoint
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

// Add feedbackPoint 1 to userid
const addFeedbackPoint = (id) => {
  const query = `select point from feedback where id=${id}`;
  db.serialize();
    db.all(query,(err, row)=>{
      if(err) {
        console.log('db error: ' + err);
        resolve(0);
      }
      else {
        const query2 = `UPDATE feedback SET point = ${row[0]['point'] + 1} where id = '${id}'`;
        db.serialize();
        db.all(query2, (err, row)=>{
          if (err) {
            console.log('db error: ' + err);
            resolve(0);
          }
          else {
            return ;
          }
        })
      }
    });
}

// Bot login to server
client.login(token);