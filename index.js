const sourcebin = require('sourcebin_js');
const config = require("./config.json")
const Discord = require("discord.js");
const { Permissions } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.DIRECT_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MEMBERS,
    ]
});



let openTickets = new Set();
let ticketOwners = new Map();
const logsChannelId = config.logsticket;



const closeCommand = new SlashCommandBuilder()
    .setName('close')
    .setDescription('Ferme le ticket actuel');

const addCommand = new SlashCommandBuilder()
    .setName('add')
    .setDescription('Ajoute un utilisateur au ticket')
    .addUserOption(option =>
        option.setName('utilisateur')
            .setDescription('Utilisateur à ajouter au ticket')
            .setRequired(true));

const renameCommand = new SlashCommandBuilder()
            .setName('rename')
            .setDescription('Renomme un canal')
            .addStringOption(option =>
                option.setName('nouveau_nom')
                    .setDescription('Le nouveau nom pour le channel')
                    .setRequired(true));





// Event "ready" = quand le bot est on
// Affiche que le bot est on
client.on("ready", () => {
    console.log("Le bot ticket est en ligne !");
    

// Message pour ouvrir un ticket
    const embedticket = new Discord.MessageEmbed()
        .setColor(config.couleurpanel)
        .setTitle(config.titrepanel)
        .setURL(config.urlpanel)
        .setThumbnail(config.logo)
        .setTimestamp()
        .setDescription(config.textepanel)
        .setFooter({text: config.textebaspanel, iconURL: config.logo});

    var row = new Discord.MessageActionRow()
        .addComponents(new Discord.MessageButton()
            .setCustomId("openticket")
            .setLabel(config.labelboutonpanel)
            .setStyle(config.styleboutton) // Primary - Secondary - Success - Danger 
        );

    const channel = client.channels.cache.get(config.channelticket);
    
    // Vérifier s'il y a déjà un message dans le canal
    channel.messages.fetch().then(messages => {
        const existingTicketMessage = messages.find(msg => msg.author.id === client.user.id && msg.embeds.length > 0 && msg.embeds[0].title === config.titrepanel);
        
        if (!existingTicketMessage) {
            channel.send({ embeds: [embedticket], components: [row] });
        }
    });


// Chargement des commandes
    const commands = [
        closeCommand.toJSON(),
        addCommand.toJSON(),
        renameCommand.toJSON()
    ];
    
    const guildId = config.server;
    client.guilds.cache.get(guildId)?.commands.set(commands)
        .then(() => console.log('Commande /close enregistrée'),
                    console.log('Commande /add enregistrée'),
                    console.log("Commande /rename enregistrée"))
        .catch(console.error);
});


// Event "messageCreate" = quand un message est envoyé
client.on("messageCreate", message => {
    if (message.author.bot) return;
});






// Config Ticket
client.on("interactionCreate", interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === "openticket") {
            // Votre code pour ouvrir un ticket
            if (openTickets.has(interaction.user.id)) {
                interaction.reply({content:config.ticketdejaouvert, ephemeral: true});
                return;
            }
    
            openTickets.add(interaction.user.id);

            interaction.guild.channels.create("Ticket de " + interaction.user.username, {
                parent: config.categorieticket,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [Discord.Permissions.FLAGS.VIEW_CHANNEL]
                    },
                    {
                        id: interaction.user.id,
                        allow: [Discord.Permissions.FLAGS.VIEW_CHANNEL]
                    }
                ]
            }).then(channel => {

                channel.send({content: "<@" + interaction.user.id + "> Voici votre ticket. Un membre du staff va bientôt vous prendre en charge. \n Pour fermer le ticket, demander à un staff d'exécuter la commande. \n L'équipe"});

                // Enregistrez l'ID du propriétaire du ticket
                ticketOwners.set(channel.id, interaction.user.id);

                interaction.reply({content: "Voici votre ticket : " + channel.toString(), ephemeral: true});
            });
        }
    }
});






// Commande /close
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'close') {
        if (interaction.channel && interaction.channel.parentId === config.categorieticket) {
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const ticketOwnerId = ticketOwners.get(interaction.channel.id);
            const ticketOwnerMember = interaction.guild.members.cache.get(ticketOwnerId);

            // Générer le transcript des messages
            const messages = await interaction.channel.messages.fetch();
            const transcript = Array.from(messages.values()).reverse().map(m =>
                `${new Date(m.createdAt).toLocaleString('en-US')} - ${m.author.tag}: ${m.attachments.size > 0 ? m.attachments.first().proxyURL : m.content}`
            ).join('\n');

            sourcebin.create([
                {
                    name: ' ',
                    content: transcript,
                    languageId: 'text'
                }
            ], {
                title: 'Transcription du ticket',
                description: ' '
            })
            .then(bin => {

                // Envoyer le transcript au propriétaire du ticket
                if (ticketOwnerMember) {
                    const transcriptMessage = `Votre ticket a été fermé par <@${member.user.id}>. Voici la transcription de votre ticket : ${bin.url} `;
                    ticketOwnerMember.send(transcriptMessage);
                }

                interaction.channel.delete()
                    .then(() => {
                        const logsChannel = interaction.guild.channels.cache.get(logsChannelId);

                        if (logsChannel) {
                            const logEmbed = new Discord.MessageEmbed()
                                .setColor("#00ff00")
                                .setTitle("**__Ticket Fermé__**")
                                .addFields(
                                    { name: "__ID du Propriétaire__", value: "<@" + ticketOwnerId + ">", inline: true },
                                    { name: "__Fermé par :__", value: "<@" + member.user.id + ">", inline: true },
                                    { name: "__Transcription :__", value: bin.url, inline: true}
                                )
                                .setTimestamp();

                            logsChannel.send({ embeds: [logEmbed] });
                        }

                        // Supprimez l'ID du propriétaire du ticket de la liste ticketOwners
                        if (interaction.channel) {
                            ticketOwners.delete(interaction.channel.id);
                        }

                        // Supprimez également l'ID de l'utilisateur du Set openTickets
                        openTickets.delete(interaction.user.id);

                        interaction.reply('Le ticket a été fermé avec succès');
                    })
                    .catch(console.error);
            })
            .catch(console.error);
        } else {
            interaction.reply({ content: 'Cette commande ne peut être utilisée que dans un canal de ticket.', ephemeral: true });
        }
    }
});






// Commande /add
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'add') {
        if (interaction.channel && interaction.channel.parentId === config.categorieticket) {
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const ticketOwnerId = ticketOwners.get(interaction.channel.id);

            if (!member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
                interaction.reply({ content: 'Vous n\'avez pas les permissions pour ajouter un utilisateur au ticket.', ephemeral: true });
                return;
            }

            const userToAdd = options.getUser('utilisateur');

            if (!userToAdd) {
                interaction.reply({ content: 'Utilisateur invalide.', ephemeral: true });
                return;
            }

            const ticketOwnerMember = interaction.guild.members.cache.get(ticketOwnerId);

            interaction.channel.permissionOverwrites.create(userToAdd, {
                VIEW_CHANNEL: true,
                SEND_MESSAGES: true,
                READ_MESSAGE_HISTORY: true
            }).then(() => {
                interaction.reply(`L'utilisateur <@${userToAdd.id}> a été ajouté au ticket avec succès.`);

            }).catch(error => {
                console.error('Error adding user to ticket:', error);
                interaction.reply({ content: 'Une erreur s\'est produite lors de l\'ajout de l\'utilisateur au ticket.', ephemeral: true });
            });
        } else {
            interaction.reply({ content: 'Cette commande ne peut être utilisée que dans un canal de ticket.', ephemeral: true });
        }
    }
});





// Commande /rename
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;

    if (commandName === 'rename') {
        if (interaction.channel && interaction.channel.parentId === config.categorieticket) {
            const member = interaction.guild.members.cache.get(interaction.user.id);

            if (!member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS)) {
                interaction.reply({ content: 'Vous n\'avez pas les permissions pour renommer ce channel.', ephemeral: true });
                return;
            }

            const newChannelName = options.getString('nouveau_nom');

            if (!newChannelName) {
                interaction.reply({ content: 'Nom de channel invalide.', ephemeral: true });
                return;
            }

            interaction.channel.setName(newChannelName)
                .then(() => {
                    interaction.reply({content:`Le channel a été renommé en "${newChannelName}" avec succès.`, ephemeral: true});
                })
                .catch(error => {
                    console.error('Error renaming channel:', error);
                    interaction.reply({ content: 'Une erreur s\'est produite lors du renommage du channel.', ephemeral: true });
                });
        } else {
            interaction.reply({ content: 'Cette commande ne peut être utilisée que dans un channel de ticket.', ephemeral: true });
        }
    }
});







// Login Bot
client.login(config.token);
client.once('ready', () => {
    client.user.setPresence({
        activities: [{
            name: 'les tickets !',
            type: 'WATCHING'
        }],
        status: 'online'
    });
});