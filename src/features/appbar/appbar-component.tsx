import * as React from 'react';
import {useState} from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuIcon from '@mui/icons-material/Menu';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import {Link as RouterLink, useLocation} from 'react-router-dom';
import ThemeSettingsMenu from '../../theme/theme-settings-menu';
import logo from '../../assets/Logo_DPLMT.svg';

const pages = [
    {label: 'Rapports', path: '/', activePrefixes: ['/rapport-view']},
    {label: 'Alertes', path: '/alertes'},
    {label: 'Paramètres', path: '/parametres'},
    {label: 'Aide', path: '/help'},
];
const settings = ['Profile', 'Account', 'Dashboard', 'Logout'];

function isPageActive(page: (typeof pages)[number], pathname: string): boolean {
    if (pathname === page.path) return true;
    return page.activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;
}

function ResponsiveAppBar() {
    const [anchorElNav, setAnchorElNav] = useState<null | HTMLElement>(null);
    const [anchorElUser, setAnchorElUser] = useState<null | HTMLElement>(null);
    const {pathname} = useLocation();

    const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElNav(event.currentTarget);
    };
    const handleOpenUserMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElUser(event.currentTarget);
    };

    const handleCloseNavMenu = () => {
        setAnchorElNav(null);
    };

    const handleCloseUserMenu = () => {
        setAnchorElUser(null);
    };

    return (
        <Box sx={{position: 'sticky', top: 0, zIndex: (theme) => theme.zIndex.appBar}}>
            {/* Opaque strip covering the gap above the bar, so scrolled content can't peek through it. */}
            <Box sx={{height: '20px', bgcolor: 'common.white'}}/>
            <AppBar position="static">
                <Container maxWidth="xl">
                    <Toolbar disableGutters>
                        <Box
                            component={RouterLink}
                            to="/"
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                textDecoration: 'none',
                                color: 'inherit',
                                mr: {xs: 2, md: 6},
                            }}
                        >
                            <Box component="img" src={logo} alt="DPLMT" sx={{height: {xs: 36, md: 40}, mr: 1.5}}/>
                            <Typography
                                variant="h6"
                                noWrap
                                sx={{
                                    display: {xs: 'none', sm: 'block'},
                                    fontWeight: 700,
                                    letterSpacing: '.05rem',
                                }}
                            >
                                GAS FS
                            </Typography>
                        </Box>

                        <Box sx={{flexGrow: 1, display: {xs: 'flex', md: 'none'}}}>
                            <IconButton
                                size="large"
                                aria-label="account of current user"
                                aria-controls="menu-appbar"
                                aria-haspopup="true"
                                onClick={handleOpenNavMenu}
                                color="inherit"
                            >
                                <MenuIcon/>
                            </IconButton>
                            <Menu
                                id="menu-appbar"
                                anchorEl={anchorElNav}
                                anchorOrigin={{
                                    vertical: 'bottom',
                                    horizontal: 'left',
                                }}
                                keepMounted
                                transformOrigin={{
                                    vertical: 'top',
                                    horizontal: 'left',
                                }}
                                open={Boolean(anchorElNav)}
                                onClose={handleCloseNavMenu}
                                sx={{display: {xs: 'block', md: 'none'}}}
                            >
                                {pages.map((page) => {
                                    const isActive = isPageActive(page, pathname);
                                    return (
                                        <MenuItem key={page.path} component={RouterLink} to={page.path}
                                                  onClick={handleCloseNavMenu}>
                                            <Typography sx={{textAlign: 'center', fontWeight: isActive ? 700 : 400}}>
                                                {page.label}
                                            </Typography>
                                        </MenuItem>
                                    );
                                })}
                            </Menu>
                        </Box>
                        <Box sx={{flexGrow: 1, display: {xs: 'none', md: 'flex'}}}>
                            {pages.map((page) => {
                                const isActive = isPageActive(page, pathname);
                                return (
                                    <Button
                                        key={page.path}
                                        component={RouterLink}
                                        to={page.path}
                                        onClick={handleCloseNavMenu}
                                        sx={{
                                            my: 2,
                                            mx: 0.5,
                                            px: 1,
                                            color: 'white',
                                            display: 'block',
                                            fontWeight: isActive ? 700 : 400,
                                            borderBottom: '2px solid',
                                            borderBottomColor: isActive ? 'white' : 'transparent',
                                            borderRadius: 0,
                                        }}
                                    >
                                        {page.label}
                                    </Button>
                                );
                            })}
                        </Box>
                        <Box sx={{flexGrow: 0, display: 'flex', alignItems: 'center'}}>
                            <ThemeSettingsMenu/>
                            <Tooltip title="Paramètres du compte">
                                <IconButton onClick={handleOpenUserMenu} sx={{p: 0}}>
                                    <Avatar>
                                        <AccountCircleIcon/>
                                    </Avatar>
                                </IconButton>
                            </Tooltip>
                            <Menu
                                sx={{mt: '45px'}}
                                id="menu-appbar"
                                anchorEl={anchorElUser}
                                anchorOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                keepMounted
                                transformOrigin={{
                                    vertical: 'top',
                                    horizontal: 'right',
                                }}
                                open={Boolean(anchorElUser)}
                                onClose={handleCloseUserMenu}
                            >
                                {settings.map((setting) => (
                                    <MenuItem key={setting} onClick={handleCloseUserMenu}>
                                        <Typography sx={{textAlign: 'center'}}>{setting}</Typography>
                                    </MenuItem>
                                ))}
                            </Menu>
                        </Box>
                    </Toolbar>
                </Container>
            </AppBar>
        </Box>
    );
}

export default ResponsiveAppBar;
