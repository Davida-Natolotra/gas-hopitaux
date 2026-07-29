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
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import {Link as RouterLink, useLocation} from 'react-router-dom';
import logo from '../../assets/Logo_DPLMT.svg';

const pages = [
    {label: 'Alertes', path: '/alertes'},
    {label: 'Rapports', path: '/rapports', activePrefixes: ['/rapport-view']},
    {label: 'Paramètres', path: '/parametres'},
    {label: 'Aide', path: '/help'},
];

function isPageActive(page: (typeof pages)[number], pathname: string): boolean {
    if (pathname === page.path) return true;
    return page.activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;
}

function ResponsiveAppBar() {
    const [anchorElNav, setAnchorElNav] = useState<null | HTMLElement>(null);
    const {pathname} = useLocation();

    const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorElNav(event.currentTarget);
    };

    const handleCloseNavMenu = () => {
        setAnchorElNav(null);
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

                        <Box sx={{flexGrow: 1, display: {xs: 'flex', md: 'none'}, justifyContent: 'flex-end'}}>
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
                        <Box sx={{flexGrow: 1, display: {xs: 'none', md: 'flex'}, justifyContent: 'flex-end'}}>
                            {pages.map((page) => {
                                const isActive = isPageActive(page, pathname);
                                return (
                                    <Button
                                        key={page.path}
                                        component={RouterLink}
                                        to={page.path}
                                        onClick={handleCloseNavMenu}
                                        color="inherit"
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
                    </Toolbar>
                </Container>
            </AppBar>
        </Box>
    );
}

export default ResponsiveAppBar;
