const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('info')
		.setNameLocalizations({
			ko: '정보',
			"en-US": 'info',
		})
		.setDescription('Get infos about user & server')
		.setDescriptionLocalizations({
			ko: '유저 또는 서버의 정보 값을 받아옵니다',
			"en-US": 'Get infos about user & server',
		})
		.addSubcommand(subcommand =>
			subcommand
				.setName('user')
				.setDescription('Info about a user')
				.addUserOption(option => option.setName('target').setDescription('The user')))
		.addSubcommand(subcommand =>
			subcommand
				.setName('server')
				.setDescription('Info about the server')),
	async execute(interaction) {
		const user = interaction.options.getUser('target');
		if (interaction.options.getSubcommand() == 'user') {
			if (user) {
				await interaction.reply(`Username: ${user.username}\nID: ${user.id}`);
			} else {
				await interaction.reply(`Your username: ${interaction.user.username}\nYour ID: ${interaction.user.id}`);
			}
		} else if (interaction.options.getSubcommand() === 'server') {
			await interaction.reply(`Server name: ${interaction.guild.name}\nTotal members: ${interaction.guild.memberCount}`);
		}
	},
}